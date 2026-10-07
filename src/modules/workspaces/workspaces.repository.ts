import { Injectable } from '@nestjs/common';
import { uuidv7 } from '../../common/ids';
import { type Entitlement, type Prisma, type Workspace } from '../../generated/prisma/client';
import { PrismaService, type TenantTx } from '../../infra/prisma/prisma.service';

const ADMIN_ROLES = ['workspace_owner', 'workspace_admin'] as const;

/** Membership is active: not deactivated and not expired (M01 §6). */
const activeMembership = (now: Date): Prisma.MembershipWhereInput => ({
  deactivatedAt: null,
  OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
});

export interface NewClient {
  workspaceId: string;
  partnerWorkspaceId: string;
  grantedBy: string;
  workspace: Omit<Prisma.WorkspaceUncheckedCreateInput, 'id' | 'createdVia' | 'partnerWorkspaceId'>;
  entitlement: { plan: string; modules: string[]; limits: Prisma.InputJsonValue };
  invitation: { email: string; tokenHash: string; expiresAt: Date };
}

/**
 * workspaces (not RLS-scoped; reached only after the guard checked membership/grant), entitlements
 * (RLS) and partner grants (M02 §6). Cross-tenant reads use the explicit platform scope.
 */
@Injectable()
export class WorkspacesRepository {
  constructor(private readonly prisma: PrismaService) {}

  find(id: string): Promise<Workspace | null> {
    return this.prisma.workspace.findUnique({ where: { id } });
  }

  update(id: string, data: Prisma.WorkspaceUncheckedUpdateInput): Promise<Workspace> {
    return this.prisma.workspace.update({ where: { id }, data });
  }

  entitlement(workspaceId: string) {
    return this.prisma.withTenant(workspaceId, (tx) => tx.entitlement.findUnique({ where: { workspaceId } }));
  }

  putEntitlement(
    workspaceId: string,
    data: { plan: string; modules: string[]; limits: Prisma.InputJsonValue; updatedBy: string },
  ) {
    return this.prisma.withTenant(workspaceId, (tx) =>
      tx.entitlement.upsert({ where: { workspaceId }, create: { workspaceId, ...data }, update: data }),
    );
  }

  /** Seats: active members + pending, unexpired invitations (same rule as M01 invites). */
  async seats(workspaceId: string, now: Date): Promise<number> {
    const members = await this.prisma.membership.count({ where: { workspaceId, ...activeMembership(now) } });
    const pending = await this.prisma.withTenant(workspaceId, (tx) =>
      tx.invitation.count({ where: { workspaceId, acceptedAt: null, expiresAt: { gt: now } } }),
    );
    return members + pending;
  }

  // ─── partner grants ───
  countActiveGrants(partnerWorkspaceId: string, tx?: TenantTx): Promise<number> {
    return (tx ?? this.prisma).partnerGrant.count({ where: { partnerWorkspaceId, revokedAt: null } });
  }

  grantsReceived(clientWorkspaceId: string) {
    return this.prisma.partnerGrant.findMany({
      where: { clientWorkspaceId, revokedAt: null },
      include: { partnerWorkspace: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  grantsGiven(partnerWorkspaceId: string, cursor: string | undefined, take: number) {
    return this.prisma.partnerGrant.findMany({
      where: { partnerWorkspaceId, revokedAt: null, ...(cursor ? { id: { gt: cursor } } : {}) },
      include: { clientWorkspace: { select: { id: true, name: true, status: true } } },
      orderBy: { id: 'asc' },
      take,
    });
  }

  /** Revokes an active grant to `clientWorkspaceId`; null when there is none with that id. */
  async revokeGrant(clientWorkspaceId: string, grantId: string, now: Date) {
    const res = await this.prisma.partnerGrant.updateMany({
      where: { id: grantId, clientWorkspaceId, revokedAt: null },
      data: { revokedAt: now },
    });
    if (res.count === 0) return null;
    return this.prisma.partnerGrant.findUnique({
      where: { id: grantId },
      include: { partnerWorkspace: { select: { id: true, name: true } } },
    });
  }

  /** Owner/admin emails of a workspace (partner revocation notice, US-02-2). */
  async adminEmails(workspaceId: string, now: Date): Promise<string[]> {
    const rows = await this.prisma.membership.findMany({
      where: {
        workspaceId,
        role: { in: [...ADMIN_ROLES] },
        ...activeMembership(now),
        user: { status: 'active' },
      },
      select: { user: { select: { email: true } } },
    });
    return rows.map((r) => r.user.email);
  }

  /** Per client workspace: active company count and latest audit event (the partner holds a grant to each). */
  async clientStats(workspaceId: string) {
    return this.prisma.withTenant(workspaceId, async (tx) => {
      const companies = await tx.company.count({ where: { workspaceId, deletedAt: null } });
      const last = await tx.auditEvent.findFirst({
        where: { workspaceId },
        orderBy: { id: 'desc' },
        select: { occurredAt: true },
      });
      return { companies, lastActivityAt: last?.occurredAt ?? null };
    });
  }

  /**
   * Partner onboarding (US-02-1) in one transaction: client workspace + entitlements + first
   * company + owner invitation + partner grant. A per-partner lock serialises the quota check.
   */
  createClient(
    input: NewClient,
    check: (tx: TenantTx) => Promise<void>,
    company: (tx: TenantTx, workspaceId: string) => Promise<{ id: string }>,
  ) {
    const { workspaceId } = input;
    return this.prisma.withTenant(workspaceId, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`partner:${input.partnerWorkspaceId}`}, 0))`;
      await check(tx);
      await tx.workspace.create({
        data: {
          ...input.workspace,
          id: workspaceId,
          createdVia: 'partner',
          partnerWorkspaceId: input.partnerWorkspaceId,
        },
      });
      await tx.entitlement.create({
        data: { workspaceId, ...input.entitlement, updatedBy: input.grantedBy },
      });
      const created = await company(tx, workspaceId);
      const invitation = await tx.invitation.create({
        data: {
          id: uuidv7(),
          workspaceId,
          email: input.invitation.email,
          role: 'workspace_owner',
          tokenHash: input.invitation.tokenHash,
          expiresAt: input.invitation.expiresAt,
          invitedBy: input.grantedBy,
        },
      });
      const grant = await tx.partnerGrant.create({
        data: {
          id: uuidv7(),
          partnerWorkspaceId: input.partnerWorkspaceId,
          clientWorkspaceId: workspaceId,
          grantedBy: input.grantedBy,
        },
      });
      return { workspaceId, companyId: created.id, invitationId: invitation.id, grantId: grant.id };
    });
  }

  // ─── platform (audited by the callers) ───
  platformList(
    filter: { q?: string | undefined; status?: Workspace['status'] | undefined },
    cursor: string | undefined,
    take: number,
  ) {
    return this.prisma.workspace.findMany({
      where: {
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.q
          ? {
              OR: [
                { name: { contains: filter.q, mode: 'insensitive' } },
                { slug: { contains: filter.q, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      orderBy: { id: 'asc' },
      take,
    });
  }

  /** Entitlements, company and member counts for a page of workspaces (platform scope read). */
  async platformStats(ids: string[]): Promise<{
    entitlements: Map<string, Entitlement>;
    companies: Map<string, number>;
    members: Map<string, number>;
  }> {
    if (ids.length === 0) return { entitlements: new Map(), companies: new Map(), members: new Map() };
    const [ents, companies] = await this.prisma.withPlatformScope(
      async (tx) =>
        [
          await tx.entitlement.findMany({ where: { workspaceId: { in: ids } } }),
          await tx.company.groupBy({
            by: ['workspaceId'],
            where: { workspaceId: { in: ids }, deletedAt: null },
            _count: { _all: true },
          }),
        ] as const,
    );
    const members = await this.prisma.membership.groupBy({
      by: ['workspaceId'],
      where: { workspaceId: { in: ids }, deactivatedAt: null },
      _count: { _all: true },
    });
    return {
      entitlements: new Map(ents.map((e) => [e.workspaceId, e])),
      companies: new Map(companies.map((c) => [c.workspaceId, c._count._all])),
      members: new Map(members.map((m) => [m.workspaceId, m._count._all])),
    };
  }
}
