import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { type AuthenticatedPrincipal, type MembershipRoleName } from '../../common/auth/principal';
import { ProblemError } from '../../common/errors/problem';
import { type RequestMeta } from '../../common/http/request-meta';
import { toPage } from '../../common/pagination';
import { type Invitation, type Prisma, type User } from '../../generated/prisma/client';
import { RateLimiter } from '../../infra/rate-limit/rate-limiter';
import { AuditService } from '../audit/audit.service';
import { AccessRepository, LastOwnerError, type MemberFilter } from './access.repository';
import { identityEmails } from './emails';
import { type InviteRow, parseInviteCsv } from './engine/invite-csv';
import { canGrantRole, canManageMember, type RoleActor } from './engine/permissions';
import {
  decodeTenantToken,
  encodeTenantToken,
  expiresAt,
  hashToken,
  isTokenUsable,
  TTL,
} from './engine/tokens';
import { AuthEvents } from './events';
import { IdentityMailer } from './identity-mailer';
import { InvitationsRepository } from './invitations.repository';
import { PasswordService } from './password.service';
import { LIMITS } from './rate-limits';
import { SessionsService } from './sessions.service';
import { UsersRepository } from './users.repository';

const notFound = () => new ProblemError('not_found', 'Not found');
const invalidInvitation = () =>
  new ProblemError('invalid_token', 'This invitation is invalid or has expired');
const actorOf = (p: AuthenticatedPrincipal) => ({
  type: 'user' as const,
  id: p.userId,
  impersonatorId: p.impersonatorId,
});

/** Role the principal acts with for the role ceiling (M01 §7). */
const roleActor = (p: AuthenticatedPrincipal): RoleActor | null =>
  p.platformRole === 'platform_owner' ? 'platform_owner' : p.role;

export interface MemberPatch {
  role?: MembershipRoleName | undefined;
  companyIds?: string[] | undefined;
  projectIds?: string[] | undefined;
  expiresAt?: string | null | undefined;
  active?: boolean | undefined;
}

const toMember = (m: Awaited<ReturnType<AccessRepository['listMembers']>>[number]) => ({
  id: m.id,
  userId: m.userId,
  name: m.user.name,
  email: m.user.email,
  role: m.role,
  companyIds: m.companyIds,
  projectIds: m.projectIds,
  status: m.deactivatedAt
    ? ('deactivated' as const)
    : m.user.status === 'disabled'
      ? ('disabled' as const)
      : ('active' as const),
  lastLoginAt: m.user.lastLoginAt?.toISOString() ?? null,
  expiresAt: m.expiresAt?.toISOString() ?? null,
  createdAt: m.createdAt.toISOString(),
});

const toInvitation = (i: Invitation) => ({
  id: i.id,
  email: i.email,
  role: i.role,
  companyIds: i.companyIds,
  projectIds: i.projectIds,
  expiresAt: i.expiresAt.toISOString(),
  expired: i.expiresAt.getTime() <= Date.now(),
  invitedBy: i.invitedBy,
  createdAt: i.createdAt.toISOString(),
});

/** Workspace members & invitations (M01 §4.1, §7, §8; US-01-1). */
@Injectable()
export class MembersService {
  constructor(
    private readonly access: AccessRepository,
    private readonly invitations: InvitationsRepository,
    private readonly users: UsersRepository,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionsService,
    private readonly limiter: RateLimiter,
    private readonly audit: AuditService,
    private readonly mailer: IdentityMailer,
  ) {}

  /** `:wid` must be the caller's current workspace; any other id is indistinguishable from missing. */
  private scope(p: AuthenticatedPrincipal, wid: string): string {
    if (!p.workspaceId || p.workspaceId !== wid) throw notFound();
    return wid;
  }

  async list(
    p: AuthenticatedPrincipal,
    wid: string,
    filter: MemberFilter,
    cursor: string | undefined,
    limit: number,
  ) {
    const rows = await this.access.listMembers(this.scope(p, wid), filter, cursor, limit + 1);
    return toPage(rows.map(toMember), limit);
  }

  async update(p: AuthenticatedPrincipal, wid: string, id: string, patch: MemberPatch, meta: RequestMeta) {
    const member = await this.access.findMember(this.scope(p, wid), id);
    if (!member) throw notFound();
    const actor = roleActor(p);
    const self = member.userId === p.userId;
    if (self && (patch.role !== undefined || patch.active !== undefined)) {
      throw new ProblemError('forbidden', 'You cannot change your own role or status');
    }
    if (!canManageMember(actor, member.role))
      throw new ProblemError('forbidden', 'You cannot manage this member');
    if (patch.role && !canGrantRole(actor, patch.role))
      throw new ProblemError('forbidden', 'You cannot grant this role');
    if (patch.companyIds) await this.assertCompanies(wid, patch.companyIds);

    const data: Prisma.MembershipUpdateInput = {
      ...(patch.role ? { role: patch.role } : {}),
      ...(patch.companyIds ? { companyIds: patch.companyIds } : {}),
      ...(patch.projectIds ? { projectIds: patch.projectIds } : {}),
      ...(patch.expiresAt !== undefined
        ? { expiresAt: patch.expiresAt ? new Date(patch.expiresAt) : null }
        : {}),
      ...(patch.active !== undefined ? { deactivatedAt: patch.active ? null : new Date() } : {}),
    };
    try {
      await this.access.updateMemberKeepingOwner(wid, id, data, new Date());
    } catch (e) {
      if (e instanceof LastOwnerError) throw new ProblemError('conflict', e.message);
      throw e;
    }
    await this.audit.record(
      {
        action: AuthEvents.membershipUpdated,
        entityType: 'membership',
        entityId: id,
        workspaceId: wid,
        actor: actorOf(p),
        diff: {
          before: {
            role: member.role,
            companyIds: member.companyIds,
            projectIds: member.projectIds,
            active: !member.deactivatedAt,
          },
          after: patch,
        },
      },
      meta,
    );
    const updated = await this.access.findMember(wid, id);
    return toMember(updated!);
  }

  async remove(p: AuthenticatedPrincipal, wid: string, id: string, meta: RequestMeta): Promise<void> {
    const member = await this.access.findMember(this.scope(p, wid), id);
    if (!member) throw notFound();
    if (member.userId !== p.userId && !canManageMember(roleActor(p), member.role)) {
      throw new ProblemError('forbidden', 'You cannot manage this member');
    }
    try {
      await this.access.deleteMemberKeepingOwner(wid, id, new Date());
    } catch (e) {
      if (e instanceof LastOwnerError) throw new ProblemError('conflict', e.message);
      throw e;
    }
    await this.audit.record(
      {
        action: AuthEvents.membershipRemoved,
        entityType: 'membership',
        entityId: id,
        workspaceId: wid,
        actor: actorOf(p),
        diff: { role: member.role, userId: member.userId },
      },
      meta,
    );
  }

  // ─── invitations ───

  async invite(p: AuthenticatedPrincipal, wid: string, rows: InviteRow[], meta: RequestMeta) {
    this.scope(p, wid);
    const actor = roleActor(p);
    const denied = [...new Set(rows.filter((r) => !canGrantRole(actor, r.role)).map((r) => r.role))];
    if (denied.length) throw new ProblemError('forbidden', 'You cannot grant this role', denied.join(', '));
    await this.assertCompanies(wid, [...new Set(rows.flatMap((r) => r.companyIds))]);

    const results: Array<{
      email: string;
      status: 'invited' | 'already_member';
      invitationId: string | null;
    }> = [];
    const toInvite: InviteRow[] = [];
    for (const row of rows) {
      if (await this.access.findMembershipByEmail(wid, row.email))
        results.push({ email: row.email, status: 'already_member', invitationId: null });
      else toInvite.push(row);
    }
    if (toInvite.length === 0) return { results };

    const now = new Date();
    const tokens = new Map<string, string>();
    const items = toInvite.map((r) => {
      const token = encodeTenantToken(wid, randomBytes(32));
      tokens.set(r.email, token);
      return { ...r, tokenHash: hashToken(token), expiresAt: expiresAt(now, TTL.invitationMs) };
    });
    const ent = await this.access.entitlements(wid);
    const userLimit = (ent?.limits as { users?: unknown } | null)?.users;
    const created = await this.invitations.createMany(wid, p.userId, items, async (tx) => {
      if (typeof userLimit !== 'number') return;
      const seats =
        (await this.access.countActiveMembers(wid, now, tx)) +
        (await this.invitations.countPending(wid, now, tx));
      if (seats + items.length > userLimit) {
        throw new ProblemError('limit_exceeded', 'User limit reached', `The plan allows ${userLimit} users`, {
          limit: 'users',
        });
      }
    });

    const inviter = await this.users.findById(p.userId);
    const workspace = await this.access.getWorkspace(wid);
    for (const inv of created) {
      await this.mailer.send(
        identityEmails.invitation(inv.email, {
          workspaceName: workspace?.name ?? 'ResiliSense',
          inviterName: inviter?.name ?? 'A colleague',
          url: this.mailer.link('/accept-invite', tokens.get(inv.email)),
        }),
      );
      results.push({ email: inv.email, status: 'invited', invitationId: inv.id });
    }
    await this.audit.record(
      created.map((inv) => ({
        action: AuthEvents.userInvited,
        entityType: 'invitation',
        entityId: inv.id,
        workspaceId: wid,
        actor: actorOf(p),
        diff: { role: inv.role, companyIds: inv.companyIds, projectIds: inv.projectIds },
      })),
      meta,
    );
    return { results };
  }

  inviteCsv(p: AuthenticatedPrincipal, wid: string, csv: string, meta: RequestMeta) {
    this.scope(p, wid);
    const { rows, issues } = parseInviteCsv(csv);
    if (issues.length) {
      throw new ProblemError('validation_failed', 'CSV is invalid', undefined, {
        errors: issues.map((i) => ({ path: `csv:${i.line}`, message: i.message })),
      });
    }
    return this.invite(p, wid, rows, meta);
  }

  async listInvitations(p: AuthenticatedPrincipal, wid: string, cursor: string | undefined, limit: number) {
    const rows = await this.invitations.listPending(this.scope(p, wid), cursor, limit + 1);
    return toPage(rows.map(toInvitation), limit);
  }

  async resend(p: AuthenticatedPrincipal, wid: string, id: string, meta: RequestMeta) {
    const inv = await this.invitations.findPending(this.scope(p, wid), id);
    if (!inv) throw notFound();
    if (!canGrantRole(roleActor(p), inv.role))
      throw new ProblemError('forbidden', 'You cannot grant this role');
    const token = encodeTenantToken(wid, randomBytes(32));
    const renewed = await this.invitations.renew(
      wid,
      id,
      hashToken(token),
      expiresAt(new Date(), TTL.invitationMs),
    );
    const [inviter, workspace] = await Promise.all([
      this.users.findById(p.userId),
      this.access.getWorkspace(wid),
    ]);
    await this.mailer.send(
      identityEmails.invitation(renewed.email, {
        workspaceName: workspace?.name ?? 'ResiliSense',
        inviterName: inviter?.name ?? 'A colleague',
        url: this.mailer.link('/accept-invite', token),
      }),
    );
    await this.audit.record(
      {
        action: AuthEvents.userInvited,
        entityType: 'invitation',
        entityId: id,
        workspaceId: wid,
        actor: actorOf(p),
        diff: { resent: true, role: renewed.role },
      },
      meta,
    );
    return toInvitation(renewed);
  }

  async revokeInvitation(
    p: AuthenticatedPrincipal,
    wid: string,
    id: string,
    meta: RequestMeta,
  ): Promise<void> {
    if (!(await this.invitations.delete(this.scope(p, wid), id))) throw notFound();
    await this.audit.record(
      {
        action: AuthEvents.invitationRevoked,
        entityType: 'invitation',
        entityId: id,
        workspaceId: wid,
        actor: actorOf(p),
      },
      meta,
    );
  }

  /** Public, token-gated (US-01-1): creates the membership; sets the password for new users. */
  async accept(
    input: { token: string; name?: string | undefined; password?: string | undefined },
    meta: RequestMeta,
  ) {
    await this.limiter.enforce(LIMITS.inviteAcceptIp, meta.ip ?? 'unknown');
    const decoded = decodeTenantToken(input.token);
    if (!decoded) throw invalidInvitation();
    const now = new Date();
    const inv = await this.invitations.findByHash(decoded.workspaceId, hashToken(input.token));
    if (!inv || inv.acceptedAt || !isTokenUsable(inv, now)) throw invalidInvitation();

    const existing = await this.users.findByEmail(inv.email);
    if (existing?.status === 'disabled') throw invalidInvitation();
    let user: { existing: User } | { create: Omit<Prisma.UserCreateInput, 'id'> };
    let userUpdate: Prisma.UserUpdateInput | null = null;
    if (!existing) {
      if (!input.name || !input.password) {
        throw new ProblemError('validation_failed', 'Name and password are required', undefined, {
          errors: [
            ...(!input.name ? [{ path: 'name', message: 'Required' }] : []),
            ...(!input.password ? [{ path: 'password', message: 'Required' }] : []),
          ],
        });
      }
      await this.passwords.assertAcceptable(input.password, [inv.email, input.name]);
      user = {
        create: {
          email: inv.email,
          name: input.name,
          passwordHash: await this.passwords.hash(input.password),
          passwordAlgo: 'argon2id',
          status: 'active',
          emailVerifiedAt: now,
        },
      };
    } else {
      user = { existing };
      if (existing.status === 'invited' || !existing.emailVerifiedAt) {
        // An unverified account may have been registered by someone else with this address (a
        // "squatter" who knows its password): accepting proves control of the mailbox, so the
        // password is replaced and existing sessions are revoked before any access is granted.
        if (!input.password) {
          throw new ProblemError('validation_failed', 'Password is required', undefined, {
            errors: [{ path: 'password', message: 'Required' }],
          });
        }
        await this.passwords.assertAcceptable(input.password, [inv.email, existing.name]);
        userUpdate = {
          passwordHash: await this.passwords.hash(input.password),
          passwordAlgo: 'argon2id',
          status: 'active',
          emailVerifiedAt: now,
        };
      }
    }

    const result = await this.invitations.accept(
      inv,
      now,
      user,
      userUpdate,
      async (tx, userId, membershipId) => {
        await this.audit.record(
          [
            {
              action: AuthEvents.invitationAccepted,
              entityType: 'invitation',
              entityId: inv.id,
              workspaceId: inv.workspaceId,
              actor: { type: 'user', id: userId },
            },
            {
              action: AuthEvents.membershipCreated,
              entityType: 'membership',
              entityId: membershipId,
              workspaceId: inv.workspaceId,
              actor: { type: 'user', id: userId },
              diff: {
                role: inv.role,
                companyIds: inv.companyIds,
                projectIds: inv.projectIds,
                invitedBy: inv.invitedBy,
              },
            },
          ],
          meta,
          tx,
        );
      },
    );
    if (result === 'consumed') throw invalidInvitation();
    if (existing && userUpdate?.passwordHash) await this.sessions.revokeAll(existing.id);
    if (result === 'already_member')
      throw new ProblemError('conflict', 'You are already a member of this workspace');
    return { status: 'accepted' as const, workspaceId: inv.workspaceId, newUser: !existing };
  }

  private async assertCompanies(wid: string, ids: string[]): Promise<void> {
    const found = await this.access.existingCompanyIds(wid, ids);
    const missing = ids.filter((id) => !found.has(id));
    if (missing.length) {
      throw new ProblemError('validation_failed', 'Unknown companies', undefined, {
        errors: missing.map((id) => ({ path: 'companyIds', message: `Unknown company ${id}` })),
      });
    }
  }
}
