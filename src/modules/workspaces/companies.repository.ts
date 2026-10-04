import { Injectable } from '@nestjs/common';
import { uuidv7 } from '../../common/ids';
import { type Company, type Prisma } from '../../generated/prisma/client';
import { PrismaService, type TenantTx } from '../../infra/prisma/prisma.service';

export interface CompanyFilter {
  q?: string | undefined;
  deleted: boolean;
  /** Contributor scope (M01 §7.1); empty = whole workspace. */
  ids?: string[] | undefined;
  /** Only deleted rows still within the restore window. */
  deletedAfter?: Date | undefined;
}

/** companies (tenant-owned, RLS) and their activity from audit_events (M02 §6, §8). */
@Injectable()
export class CompaniesRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(workspaceId: string, filter: CompanyFilter, cursor: string | undefined, take: number) {
    return this.prisma.withTenant(workspaceId, (tx) =>
      tx.company.findMany({
        where: {
          workspaceId,
          deletedAt: filter.deleted
            ? { not: null, ...(filter.deletedAfter ? { gt: filter.deletedAfter } : {}) }
            : null,
          ...(filter.ids?.length ? { id: { in: filter.ids } } : {}),
          ...(filter.q
            ? {
                OR: [
                  { displayName: { contains: filter.q, mode: 'insensitive' } },
                  { legalName: { contains: filter.q, mode: 'insensitive' } },
                ],
              }
            : {}),
          ...(cursor ? { id: { gt: cursor, ...(filter.ids?.length ? { in: filter.ids } : {}) } } : {}),
        },
        orderBy: { id: 'asc' },
        take,
      }),
    );
  }

  find(workspaceId: string, id: string): Promise<Company | null> {
    return this.prisma.withTenant(workspaceId, (tx) => tx.company.findFirst({ where: { id, workspaceId } }));
  }

  countActive(workspaceId: string, tx?: TenantTx): Promise<number> {
    const run = (t: TenantTx) => t.company.count({ where: { workspaceId, deletedAt: null } });
    return tx ? run(tx) : this.prisma.withTenant(workspaceId, run);
  }

  /**
   * Creates a company while holding a per-workspace lock, so concurrent creates cannot exceed the
   * company limit; `check` runs inside the transaction before the insert.
   */
  createLocked(
    workspaceId: string,
    data: Omit<Prisma.CompanyUncheckedCreateInput, 'id' | 'workspaceId'>,
    check: (tx: TenantTx) => Promise<void>,
  ): Promise<Company> {
    return this.prisma.withTenant(workspaceId, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`companies:${workspaceId}`}, 0))`;
      await check(tx);
      return tx.company.create({ data: { id: uuidv7(), workspaceId, ...data } });
    });
  }

  /** Creates a company inside a transaction that already set the tenant (partner onboarding). */
  createInTx(
    tx: TenantTx,
    workspaceId: string,
    data: Omit<Prisma.CompanyUncheckedCreateInput, 'id' | 'workspaceId'>,
  ) {
    return tx.company.create({ data: { id: uuidv7(), workspaceId, ...data } });
  }

  update(workspaceId: string, id: string, data: Prisma.CompanyUncheckedUpdateInput): Promise<Company> {
    return this.prisma.withTenant(workspaceId, (tx) => tx.company.update({ where: { id }, data }));
  }

  restoreLocked(workspaceId: string, id: string, check: (tx: TenantTx) => Promise<void>): Promise<Company> {
    return this.prisma.withTenant(workspaceId, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`companies:${workspaceId}`}, 0))`;
      await check(tx);
      return tx.company.update({ where: { id }, data: { deletedAt: null } });
    });
  }

  /** Sub-companies keep existing when their parent is deleted; only the link is cleared. */
  async softDelete(workspaceId: string, id: string, now: Date): Promise<Company> {
    return this.prisma.withTenant(workspaceId, async (tx) => {
      await tx.company.updateMany({ where: { parentCompanyId: id }, data: { parentCompanyId: null } });
      return tx.company.update({ where: { id }, data: { deletedAt: now } });
    });
  }

  /** Hard-deletes companies soft-deleted before `before` (GDPR, M02 §4.1). Returns the count. */
  async purgeDeleted(workspaceId: string, before: Date): Promise<number> {
    const res = await this.prisma.withTenant(workspaceId, (tx) =>
      tx.company.deleteMany({ where: { workspaceId, deletedAt: { lt: before } } }),
    );
    return res.count;
  }

  /** Latest audit event per company (activity column). */
  async lastActivity(workspaceId: string, companyIds: string[]): Promise<Map<string, Date>> {
    if (companyIds.length === 0) return new Map();
    const rows = await this.prisma.withTenant(workspaceId, (tx) =>
      tx.auditEvent.groupBy({
        by: ['entityId'],
        where: { workspaceId, entityType: 'company', entityId: { in: companyIds } },
        _max: { occurredAt: true },
      }),
    );
    return new Map(
      rows.filter((r) => r.entityId && r._max.occurredAt).map((r) => [r.entityId!, r._max.occurredAt!]),
    );
  }

  activity(workspaceId: string, companyId: string, cursor: bigint | undefined, take: number) {
    return this.prisma.withTenant(workspaceId, (tx) =>
      tx.auditEvent.findMany({
        where: {
          workspaceId,
          entityType: 'company',
          entityId: companyId,
          ...(cursor !== undefined ? { id: { lt: cursor } } : {}),
        },
        orderBy: { id: 'desc' },
        take,
      }),
    );
  }

  /** Every workspace id (the cleanup job purges per tenant, under RLS). */
  async allWorkspaceIds(): Promise<string[]> {
    const rows = await this.prisma.workspace.findMany({ select: { id: true } });
    return rows.map((r) => r.id);
  }
}
