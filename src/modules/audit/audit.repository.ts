import { Injectable } from '@nestjs/common';
import { type Prisma } from '../../generated/prisma/client';
import { PrismaService, type TenantTx } from '../../infra/prisma/prisma.service';

export type AuditInsert = Prisma.AuditEventCreateManyInput;

/**
 * audit_events is append-only (M12): insert, and read within a workspace or the explicit
 * platform scope. createMany is used because it does not need RETURNING (RLS SELECT policy).
 */
@Injectable()
export class AuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  async insert(rows: AuditInsert[], tx?: TenantTx): Promise<void> {
    await (tx ?? this.prisma).auditEvent.createMany({ data: rows });
  }

  /** Workspace-scoped read (RLS). */
  findForWorkspace(workspaceId: string, where: Prisma.AuditEventWhereInput = {}, take = 100) {
    return this.prisma.withTenant(workspaceId, (tx) =>
      tx.auditEvent.findMany({ where, orderBy: { id: 'desc' }, take }),
    );
  }

  /** Platform-scope read of events without a workspace (auth/security events). Callers audit it. */
  findPlatformEvents(where: Prisma.AuditEventWhereInput = {}, take = 100) {
    return this.prisma.withPlatformScope((tx) =>
      tx.auditEvent.findMany({ where, orderBy: { id: 'desc' }, take }),
    );
  }
}
