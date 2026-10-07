import { Injectable } from '@nestjs/common';
import { type AuthenticatedPrincipal } from '../../common/auth/principal';
import { ProblemError } from '../../common/errors/problem';
import { type RequestMeta } from '../../common/http/request-meta';
import { toPage } from '../../common/pagination';
import { type Company, Prisma } from '../../generated/prisma/client';
import { type TenantTx } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { FilesService } from '../files/files.service';
import { UsersRepository } from '../identity/users.repository';
import { actorOf, currentWorkspace, holds, invalid, limitExceeded, notFound } from './access';
import { CompaniesRepository } from './companies.repository';
import { type CreateCompanyInput, type UpdateCompanyInput } from './dto/companies.dto';
import {
  canRestore,
  confirmsCompanyName,
  parseLimits,
  purgeBefore,
  restoreDeadline,
  withinLimit,
} from './engine/limits';
import { WorkspaceEvents } from './events';
import { ReferenceRepository } from './reference.repository';

type Address = {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  postalCode?: string | null;
  state?: string | null;
};

export const toCompany = (c: Company, lastActivityAt: Date | null = null) => ({
  id: c.id,
  legalName: c.legalName,
  displayName: c.displayName,
  registrationNo: c.registrationNo,
  sectorCode: c.sectorCode,
  sizeBand: c.sizeBand,
  employeeCount: c.employeeCount,
  country: c.country,
  region: c.region,
  website: c.website,
  description: c.description,
  address: (c.address as Address | null) ?? null,
  logoFileId: c.logoFileId,
  fiscalYearStartMonth: c.fiscalYearStartMonth,
  currency: c.currency,
  parentCompanyId: c.parentCompanyId,
  createdAt: c.createdAt.toISOString(),
  updatedAt: c.updatedAt.toISOString(),
  deletedAt: c.deletedAt?.toISOString() ?? null,
  restorableUntil: c.deletedAt ? restoreDeadline(c.deletedAt).toISOString() : null,
  lastActivityAt: lastActivityAt?.toISOString() ?? null,
});

/** Columns written from a create/update body (no ids, no workspace); a null address clears it. */
function columns(
  input: Partial<CreateCompanyInput>,
): Omit<Prisma.CompanyUncheckedUpdateInput, 'id' | 'workspaceId'> {
  const { address, ...rest } = input;
  const out: Record<string, unknown> = Object.fromEntries(
    Object.entries(rest).filter(([, v]) => v !== undefined),
  );
  if (address !== undefined) out.address = address === null ? Prisma.DbNull : address;
  return out;
}

/** Field names recorded in an audit diff (`{ fields: [...] }`); never values. */
function changedFields(diff: unknown): string[] {
  const fields = (diff as { fields?: unknown } | null)?.fields;
  return Array.isArray(fields) ? fields.filter((f): f is string => typeof f === 'string') : [];
}

/** Reporting companies inside the current workspace (M02 §4.1, §7, §8; US-02-4). */
@Injectable()
export class CompaniesService {
  constructor(
    private readonly companies: CompaniesRepository,
    private readonly reference: ReferenceRepository,
    private readonly users: UsersRepository,
    private readonly audit: AuditService,
    private readonly files: FilesService,
  ) {}

  /** Contributors limited to companies only see those (M01 §7.1). */
  private scopeIds(p: AuthenticatedPrincipal): string[] | undefined {
    return p.scope.companyIds.length ? p.scope.companyIds : undefined;
  }

  private async mustFind(
    p: AuthenticatedPrincipal,
    id: string,
    opts: { deleted?: boolean } = {},
  ): Promise<Company> {
    const wid = currentWorkspace(p);
    const ids = this.scopeIds(p);
    if (ids && !ids.includes(id)) throw notFound();
    const c = await this.companies.find(wid, id);
    if (!c) throw notFound();
    if (!!c.deletedAt !== !!opts.deleted) throw notFound();
    return c;
  }

  async list(
    p: AuthenticatedPrincipal,
    q: { q?: string | undefined; status: 'active' | 'deleted'; cursor?: string | undefined; limit: number },
  ) {
    const wid = currentWorkspace(p);
    const deleted = q.status === 'deleted';
    if (deleted && !holds(p, 'company:update'))
      throw new ProblemError('forbidden', 'Not allowed', 'Requires permission company:update');
    const now = new Date();
    const rows = await this.companies.list(
      wid,
      { q: q.q, deleted, ids: this.scopeIds(p), ...(deleted ? { deletedAfter: purgeBefore(now) } : {}) },
      q.cursor,
      q.limit + 1,
    );
    const pageRows = toPage(rows, q.limit);
    const last = await this.companies.lastActivity(
      wid,
      pageRows.items.map((c) => c.id),
    );
    return {
      items: pageRows.items.map((c) => toCompany(c, last.get(c.id) ?? null)),
      nextCursor: pageRows.nextCursor,
    };
  }

  async get(p: AuthenticatedPrincipal, id: string) {
    const c = await this.mustFind(p, id);
    const last = await this.companies.lastActivity(c.workspaceId, [c.id]);
    return toCompany(c, last.get(c.id) ?? null);
  }

  private async validateRefs(
    wid: string,
    input: {
      sectorCode?: string | undefined;
      country?: string | undefined;
      parentCompanyId?: string | null | undefined;
      logoFileId?: string | null | undefined;
    },
    selfId?: string,
  ): Promise<void> {
    if (input.logoFileId) await this.files.assertLogo(wid, input.logoFileId);
    if (input.sectorCode !== undefined && !(await this.reference.sectorExists(input.sectorCode)))
      throw invalid('sectorCode', 'Unknown sector');
    if (input.country !== undefined && !(await this.reference.countryExists(input.country)))
      throw invalid('country', 'Unknown country');
    if (input.parentCompanyId) {
      // The parent must be a live company of this workspace and not create a cycle.
      let cursor: string | null = input.parentCompanyId;
      for (let depth = 0; cursor; depth++) {
        if (cursor === selfId || depth > 20) throw invalid('parentCompanyId', 'Invalid parent company');
        const parent: Company | null = await this.companies.find(wid, cursor);
        if (!parent || parent.deletedAt) throw invalid('parentCompanyId', 'Unknown parent company');
        cursor = parent.parentCompanyId;
      }
    }
  }

  /** Company-limit check inside the creating/restoring transaction. */
  private limitCheck(wid: string) {
    return async (tx: TenantTx) => {
      const ent = await tx.entitlement.findUnique({ where: { workspaceId: wid } });
      const max = parseLimits(ent?.limits).companies;
      if (!withinLimit(max, await this.companies.countActive(wid, tx)))
        throw limitExceeded('companies', max ?? 0, 'Company limit reached');
    };
  }

  async create(p: AuthenticatedPrincipal, input: CreateCompanyInput, meta: RequestMeta) {
    const wid = currentWorkspace(p);
    await this.validateRefs(wid, input);
    const created = await this.companies.createLocked(
      wid,
      {
        ...(columns(input) as Prisma.CompanyUncheckedCreateInput),
        displayName: input.displayName ?? input.legalName,
      },
      this.limitCheck(wid),
    );
    await this.audit.record(
      {
        action: WorkspaceEvents.companyCreated,
        entityType: 'company',
        entityId: created.id,
        workspaceId: wid,
        actor: actorOf(p),
      },
      meta,
    );
    return toCompany(created, new Date());
  }

  async update(p: AuthenticatedPrincipal, id: string, input: UpdateCompanyInput, meta: RequestMeta) {
    const existing = await this.mustFind(p, id);
    await this.validateRefs(existing.workspaceId, input, id);
    const updated = await this.companies.update(existing.workspaceId, id, columns(input));
    await this.audit.record(
      {
        action: WorkspaceEvents.companyUpdated,
        entityType: 'company',
        entityId: id,
        workspaceId: existing.workspaceId,
        actor: actorOf(p),
        diff: { fields: Object.keys(input) },
      },
      meta,
    );
    if (input.logoFileId !== undefined && existing.logoFileId !== input.logoFileId)
      await this.files.retireLogo(existing.workspaceId, existing.logoFileId, actorOf(p), meta);
    return toCompany(updated, new Date());
  }

  /** Soft delete; the user must type the company name (M02 §7). Restorable for 30 days. */
  async remove(p: AuthenticatedPrincipal, id: string, confirmName: string | undefined, meta: RequestMeta) {
    const existing = await this.mustFind(p, id);
    if (!confirmsCompanyName(confirmName, existing))
      throw invalid('confirmName', 'Type the company name to confirm');
    const deleted = await this.companies.softDelete(existing.workspaceId, id, new Date());
    await this.audit.record(
      {
        action: WorkspaceEvents.companyDeleted,
        entityType: 'company',
        entityId: id,
        workspaceId: existing.workspaceId,
        actor: actorOf(p),
      },
      meta,
    );
    return toCompany(deleted);
  }

  async restore(p: AuthenticatedPrincipal, id: string, meta: RequestMeta) {
    const existing = await this.mustFind(p, id, { deleted: true });
    if (!canRestore(existing.deletedAt, new Date())) throw notFound();
    const restored = await this.companies.restoreLocked(
      existing.workspaceId,
      id,
      this.limitCheck(existing.workspaceId),
    );
    await this.audit.record(
      {
        action: WorkspaceEvents.companyRestored,
        entityType: 'company',
        entityId: id,
        workspaceId: existing.workspaceId,
        actor: actorOf(p),
      },
      meta,
    );
    return toCompany(restored, new Date());
  }

  async activity(p: AuthenticatedPrincipal, id: string, cursor: string | undefined, limit: number) {
    const c = await this.mustFind(p, id);
    const rows = await this.companies.activity(
      c.workspaceId,
      id,
      cursor ? BigInt(cursor) : undefined,
      limit + 1,
    );
    const items = rows.slice(0, limit);
    const actorIds = [...new Set(items.map((r) => r.actorId).filter((x): x is string => !!x))];
    const names = new Map((await this.users.findManyByIds(actorIds)).map((u) => [u.id, u.name]));
    return {
      items: items.map((r) => ({
        id: r.id.toString(),
        occurredAt: r.occurredAt.toISOString(),
        action: r.action,
        actor: r.actorId ? { id: r.actorId, name: names.get(r.actorId) ?? '' } : null,
        fields: changedFields(r.diff),
      })),
      nextCursor: rows.length > limit ? items[items.length - 1]!.id.toString() : null,
    };
  }
}
