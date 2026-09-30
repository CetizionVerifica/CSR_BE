import { Injectable } from '@nestjs/common';
import { type MembershipRoleName } from '../../common/auth/principal';
import { uuidv7 } from '../../common/ids';
import { type Invitation, type Prisma, type User } from '../../generated/prisma/client';
import { PrismaService, type TenantTx } from '../../infra/prisma/prisma.service';

export interface NewInvitation {
  email: string;
  role: MembershipRoleName;
  companyIds: string[];
  projectIds: string[];
  tokenHash: string;
  expiresAt: Date;
}

/** invitations are tenant-owned: every query runs inside withTenant (RLS). */
@Injectable()
export class InvitationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  countPending(workspaceId: string, now: Date, tx: TenantTx): Promise<number> {
    return tx.invitation.count({ where: { workspaceId, acceptedAt: null, expiresAt: { gt: now } } });
  }

  /** Replaces pending invitations for the same emails and inserts the new ones atomically. */
  createMany(
    workspaceId: string,
    invitedBy: string,
    items: NewInvitation[],
    check: (tx: TenantTx) => Promise<void>,
  ): Promise<Invitation[]> {
    return this.prisma.withTenant(workspaceId, async (tx) => {
      await tx.invitation.deleteMany({
        where: { workspaceId, acceptedAt: null, email: { in: items.map((i) => i.email) } },
      });
      await check(tx);
      const rows = items.map((i) => ({ id: uuidv7(), workspaceId, invitedBy, ...i }));
      await tx.invitation.createMany({ data: rows });
      return tx.invitation.findMany({ where: { id: { in: rows.map((r) => r.id) } }, orderBy: { id: 'asc' } });
    });
  }

  listPending(workspaceId: string, cursor: string | undefined, take: number) {
    return this.prisma.withTenant(workspaceId, (tx) =>
      tx.invitation.findMany({
        where: { acceptedAt: null, ...(cursor ? { id: { gt: cursor } } : {}) },
        orderBy: { id: 'asc' },
        take,
      }),
    );
  }

  findPending(workspaceId: string, id: string) {
    return this.prisma.withTenant(workspaceId, (tx) =>
      tx.invitation.findFirst({ where: { id, acceptedAt: null } }),
    );
  }

  renew(workspaceId: string, id: string, tokenHash: string, expiresAt: Date) {
    return this.prisma.withTenant(workspaceId, (tx) =>
      tx.invitation.update({ where: { id }, data: { tokenHash, expiresAt } }),
    );
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    const r = await this.prisma.withTenant(workspaceId, (tx) =>
      tx.invitation.deleteMany({ where: { id, acceptedAt: null } }),
    );
    return r.count === 1;
  }

  findByHash(workspaceId: string, tokenHash: string) {
    return this.prisma.withTenant(workspaceId, (tx) => tx.invitation.findUnique({ where: { tokenHash } }));
  }

  /**
   * Accepts in one tenant transaction: consume the invitation, create or activate the user,
   * create the membership, and write the audit rows provided by the caller.
   */
  accept(
    invitation: Invitation,
    now: Date,
    user: { existing: User } | { create: Omit<Prisma.UserCreateInput, 'id'> },
    userUpdate: Prisma.UserUpdateInput | null,
    audit: (tx: TenantTx, userId: string, membershipId: string) => Promise<void>,
  ): Promise<{ userId: string; membershipId: string } | 'already_member' | 'consumed'> {
    return this.prisma.withTenant(invitation.workspaceId, async (tx) => {
      const consumed = await tx.invitation.updateMany({
        where: { id: invitation.id, acceptedAt: null },
        data: { acceptedAt: now },
      });
      if (consumed.count !== 1) return 'consumed';
      let userId: string;
      if ('existing' in user) {
        userId = user.existing.id;
        if (userUpdate) await tx.user.update({ where: { id: userId }, data: userUpdate });
        const member = await tx.membership.findUnique({
          where: { userId_workspaceId: { userId, workspaceId: invitation.workspaceId } },
        });
        if (member) return 'already_member';
      } else {
        userId = uuidv7();
        await tx.user.create({ data: { id: userId, ...user.create } });
      }
      const membershipId = uuidv7();
      await tx.membership.create({
        data: {
          id: membershipId,
          userId,
          workspaceId: invitation.workspaceId,
          role: invitation.role,
          companyIds: invitation.companyIds,
          projectIds: invitation.projectIds,
          invitedBy: invitation.invitedBy,
        },
      });
      await audit(tx, userId, membershipId);
      return { userId, membershipId };
    });
  }
}
