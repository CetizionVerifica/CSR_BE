import { Injectable } from '@nestjs/common';
import { type AuthenticatedPrincipal } from '../../common/auth/principal';
import { type RequestMeta } from '../../common/http/request-meta';
import { toPage } from '../../common/pagination';
import { type Prisma, type Workspace } from '../../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { actorOf, notFound } from './access';
import { type PutEntitlementsInput } from './dto/workspaces.dto';
import { parseLimits } from './engine/limits';
import { WorkspaceEvents } from './events';
import { WorkspacesRepository } from './workspaces.repository';
import { knownModules } from './workspaces.service';

/** Platform owner: list workspaces, suspend/reactivate, set entitlements (M02 §8; US-02-5). */
@Injectable()
export class PlatformWorkspacesService {
  constructor(
    private readonly workspaces: WorkspacesRepository,
    private readonly audit: AuditService,
  ) {}

  private async items(rows: Workspace[]) {
    const stats = await this.workspaces.platformStats(rows.map((w) => w.id));
    return rows.map((w) => {
      const ent = stats.entitlements.get(w.id);
      return {
        id: w.id,
        name: w.name,
        slug: w.slug,
        status: w.status,
        createdVia: w.createdVia,
        partnerWorkspaceId: w.partnerWorkspaceId,
        trialEndsAt: w.trialEndsAt?.toISOString() ?? null,
        createdAt: w.createdAt.toISOString(),
        plan: ent?.plan ?? null,
        modules: knownModules(ent?.modules ?? []),
        limits: parseLimits(ent?.limits),
        companies: stats.companies.get(w.id) ?? 0,
        members: stats.members.get(w.id) ?? 0,
      };
    });
  }

  async list(
    filter: { q?: string | undefined; status?: Workspace['status'] | undefined },
    cursor: string | undefined,
    limit: number,
  ) {
    const rows = await this.workspaces.platformList(filter, cursor, limit + 1);
    const pageRows = toPage(rows, limit);
    return { items: await this.items(pageRows.items), nextCursor: pageRows.nextCursor };
  }

  async update(
    p: AuthenticatedPrincipal,
    id: string,
    input: { status?: Workspace['status'] | undefined; trialEndsAt?: string | null | undefined },
    meta: RequestMeta,
  ) {
    const w = await this.workspaces.find(id);
    if (!w) throw notFound();
    const data: Prisma.WorkspaceUpdateInput = {};
    if (input.status !== undefined) data.status = input.status;
    if (input.trialEndsAt !== undefined)
      data.trialEndsAt = input.trialEndsAt ? new Date(input.trialEndsAt) : null;
    const updated = await this.workspaces.update(id, data);
    const suspended = input.status === 'suspended' && w.status !== 'suspended';
    await this.audit.record(
      {
        action: suspended ? WorkspaceEvents.workspaceSuspended : WorkspaceEvents.workspaceUpdated,
        entityType: 'workspace',
        entityId: id,
        workspaceId: id,
        actor: actorOf(p),
        diff: { fields: Object.keys(input), ...(input.status ? { from: w.status, to: input.status } : {}) },
      },
      meta,
    );
    return (await this.items([updated]))[0]!;
  }

  async putEntitlements(
    p: AuthenticatedPrincipal,
    id: string,
    input: PutEntitlementsInput,
    meta: RequestMeta,
  ) {
    if (!(await this.workspaces.find(id))) throw notFound();
    const before = await this.workspaces.entitlement(id);
    const limits = Object.fromEntries(
      Object.entries(input.limits).filter(([, v]) => v !== undefined && v !== null),
    );
    const ent = await this.workspaces.putEntitlement(id, {
      plan: input.plan,
      modules: input.modules,
      limits,
      updatedBy: p.userId,
    });
    await this.audit.record(
      {
        action: WorkspaceEvents.entitlementsChanged,
        entityType: 'entitlements',
        entityId: id,
        workspaceId: id,
        actor: actorOf(p),
        diff: {
          before: before ? { plan: before.plan, modules: before.modules, limits: before.limits } : null,
          after: { plan: ent.plan, modules: ent.modules, limits },
        },
      },
      meta,
    );
    return { plan: ent.plan, modules: knownModules(ent.modules), limits: parseLimits(ent.limits) };
  }
}
