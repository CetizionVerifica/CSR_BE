import { Injectable } from '@nestjs/common';
import { type MembershipRoleName } from '../../common/auth/principal';
import { uuidv7 } from '../../common/ids';
import { type Membership, type Prisma } from '../../generated/prisma/client';
import { PrismaService, type TenantTx } from '../../infra/prisma/prisma.service';

const ADMIN_ROLES: MembershipRoleName[] = ['workspace_owner', 'workspace_admin'];

/** An active membership: not deactivated and not expired (time-boxed auditors). */
const activeMembership = (now: Date): Prisma.MembershipWhereInput => ({
  deactivatedAt: null,
  OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
});

export interface MemberFilter {
  role?: MembershipRoleName;
  status?: 'active' | 'deactivated';
}

/** memberships, partner grants, workspaces and entitlements as seen by identity (M01 §6, M02). */
@Injectable()
export class AccessRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActiveMembership(userId: string, workspaceId: string, now: Date): Promise<Membership | null> {
    return this.prisma.membership.findFirst({ where: { userId, workspaceId, ...activeMembership(now) } });
  }

  /** True when the user is owner/admin of a workspace holding an active grant to `clientWorkspaceId`. */
  async hasPartnerAccess(userId: string, clientWorkspaceId: string, now: Date): Promise<boolean> {
    const n = await this.prisma.partnerGrant.count({
      where: {
        clientWorkspaceId,
        revokedAt: null,
        partnerWorkspace: {
          memberships: { some: { userId, role: { in: ADMIN_ROLES }, ...activeMembership(now) } },
        },
      },
    });
    return n > 0;
  }

  getWorkspace(id: string) {
    return this.prisma.workspace.findUnique({
      where: { id },
      select: { id: true, name: true, slug: true, status: true },
    });
  }

  /** Workspaces for the switcher: memberships, then partner-granted client workspaces. */
  async accessibleWorkspaces(userId: string, now: Date) {
    const memberships = await this.prisma.membership.findMany({
      where: { userId, ...activeMembership(now) },
      include: { workspace: { select: { id: true, name: true, slug: true, status: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const partnerOf = memberships.filter((m) => ADMIN_ROLES.includes(m.role)).map((m) => m.workspaceId);
    const grants = partnerOf.length
      ? await this.prisma.partnerGrant.findMany({
          where: { partnerWorkspaceId: { in: partnerOf }, revokedAt: null },
          include: { clientWorkspace: { select: { id: true, name: true, slug: true, status: true } } },
          orderBy: { createdAt: 'asc' },
        })
      : [];
    return { memberships, grants };
  }

  entitlements(workspaceId: string) {
    return this.prisma.withTenant(workspaceId, (tx) => tx.entitlement.findUnique({ where: { workspaceId } }));
  }

  // ─── members (M01 §8) ───
  listMembers(workspaceId: string, filter: MemberFilter, cursor: string | undefined, take: number) {
    return this.prisma.membership.findMany({
      where: {
        workspaceId,
        ...(filter.role ? { role: filter.role } : {}),
        ...(filter.status === 'active' ? { deactivatedAt: null } : {}),
        ...(filter.status === 'deactivated' ? { deactivatedAt: { not: null } } : {}),
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      include: { user: { select: { id: true, name: true, email: true, status: true, lastLoginAt: true } } },
      orderBy: { id: 'asc' },
      take,
    });
  }

  findMember(workspaceId: string, membershipId: string) {
    return this.prisma.membership.findFirst({
      where: { id: membershipId, workspaceId },
      include: { user: { select: { id: true, name: true, email: true, status: true, lastLoginAt: true } } },
    });
  }

  findMembershipByEmail(workspaceId: string, email: string) {
    return this.prisma.membership.findFirst({ where: { workspaceId, user: { email } } });
  }

  /**
   * Applies a member change while guaranteeing the workspace keeps ≥ 1 active owner (M01 §7):
   * the check runs after the write inside the transaction, which is rolled back on violation.
   */
  updateMemberKeepingOwner(
    workspaceId: string,
    membershipId: string,
    data: Prisma.MembershipUpdateInput,
    now: Date,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM memberships WHERE workspace_id = ${workspaceId}::uuid FOR UPDATE`;
      const updated = await tx.membership.update({ where: { id: membershipId }, data });
      if ((await this.activeOwners(tx, workspaceId, now)) === 0) throw new LastOwnerError();
      return updated;
    });
  }

  deleteMemberKeepingOwner(workspaceId: string, membershipId: string, now: Date) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM memberships WHERE workspace_id = ${workspaceId}::uuid FOR UPDATE`;
      await tx.membership.delete({ where: { id: membershipId } });
      if ((await this.activeOwners(tx, workspaceId, now)) === 0) throw new LastOwnerError();
      return true;
    });
  }

  private activeOwners(tx: TenantTx, workspaceId: string, now: Date): Promise<number> {
    return tx.membership.count({ where: { workspaceId, role: 'workspace_owner', ...activeMembership(now) } });
  }

  countActiveMembers(workspaceId: string, now: Date, tx?: TenantTx): Promise<number> {
    return (tx ?? this.prisma).membership.count({ where: { workspaceId, ...activeMembership(now) } });
  }

  /** Company ids (of `ids`) that exist and are not deleted in the workspace (RLS). */
  async existingCompanyIds(workspaceId: string, ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await this.prisma.withTenant(workspaceId, (tx) =>
      tx.company.findMany({ where: { id: { in: ids }, deletedAt: null }, select: { id: true } }),
    );
    return new Set(rows.map((r) => r.id));
  }

  /** Self-service trial (M01 §7.1): workspace + trial entitlements + owner membership, one transaction. */
  createTrialWorkspace(
    input: { userId: string; name: string; slug: string; modules: string[] },
    first: (tx: TenantTx) => Promise<void>,
  ) {
    const workspaceId = uuidv7();
    return this.prisma.withTenant(workspaceId, async (tx) => {
      await first(tx);
      await tx.workspace.create({
        data: {
          id: workspaceId,
          name: input.name,
          slug: input.slug,
          status: 'trial',
          createdVia: 'self_service',
        },
      });
      await tx.entitlement.create({
        data: {
          workspaceId,
          plan: 'trial',
          modules: input.modules,
          limits: { companies: 1, users: 5, projectsPerYear: 1 },
        },
      });
      await tx.membership.create({
        data: { id: uuidv7(), userId: input.userId, workspaceId, role: 'workspace_owner' },
      });
      return workspaceId;
    });
  }

  countMemberships(userId: string): Promise<number> {
    return this.prisma.membership.count({ where: { userId } });
  }
}

export class LastOwnerError extends Error {
  constructor() {
    super('A workspace must keep at least one owner');
  }
}
