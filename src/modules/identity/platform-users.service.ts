import { Injectable } from '@nestjs/common';
import { type AuthenticatedPrincipal, type PlatformRoleName } from '../../common/auth/principal';
import { ProblemError } from '../../common/errors/problem';
import { type RequestMeta } from '../../common/http/request-meta';
import { toPage } from '../../common/pagination';
import { type Prisma, type User } from '../../generated/prisma/client';
import { AuditService } from '../audit';
import { TTL } from './engine/tokens';
import { AuthEvents } from './events';
import { toProfile } from './me.service';
import { SessionsService } from './sessions.service';
import { TokenService } from './token.service';
import { UsersRepository } from './users.repository';
import { WorkspaceAccessService } from './workspace-access.service';

const notFound = () => new ProblemError('not_found', 'User not found');
const actorOf = (p: AuthenticatedPrincipal) => ({
  type: 'user' as const,
  id: p.userId,
  impersonatorId: p.impersonatorId,
});

/** Platform-owner user administration (M01 §8 `/platform/users`, US-01-5, §7.1 impersonation). */
@Injectable()
export class PlatformUsersService {
  constructor(
    private readonly users: UsersRepository,
    private readonly sessions: SessionsService,
    private readonly tokens: TokenService,
    private readonly workspaceAccess: WorkspaceAccessService,
    private readonly audit: AuditService,
  ) {}

  async list(
    filter: {
      q?: string | undefined;
      status?: User['status'] | undefined;
      platformRole?: PlatformRoleName | undefined;
    },
    cursor: string | undefined,
    limit: number,
  ) {
    const rows = await this.users.listForPlatform(
      {
        ...(filter.q ? { q: filter.q } : {}),
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.platformRole ? { platformRole: filter.platformRole } : {}),
      },
      cursor,
      limit + 1,
    );
    return toPage(rows.map(toProfile), limit);
  }

  /** platformRole is only ever set here, by a platform owner (M01 §7). Nobody changes their own. */
  async update(
    p: AuthenticatedPrincipal,
    id: string,
    patch: { status?: 'active' | 'disabled' | undefined; platformRole?: PlatformRoleName | null | undefined },
    meta: RequestMeta,
  ) {
    this.noImpersonation(p);
    const user = await this.users.findById(id);
    if (!user) throw notFound();
    if (id === p.userId)
      throw new ProblemError('forbidden', 'You cannot change your own platform role or status');
    const data: Prisma.UserUpdateInput = {
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.platformRole !== undefined ? { platformRole: patch.platformRole } : {}),
    };
    const updated = await this.users.update(id, data);
    if (patch.status === 'disabled') await this.sessions.revokeAll(id);
    await this.audit.record(
      {
        action: AuthEvents.platformUserUpdated,
        entityType: 'user',
        entityId: id,
        actor: actorOf(p),
        diff: { before: { status: user.status, platformRole: user.platformRole }, after: patch },
      },
      meta,
    );
    return toProfile(updated);
  }

  async listSessions(id: string) {
    if (!(await this.users.findById(id))) throw notFound();
    return this.sessions.list(id, null);
  }

  async revokeSession(
    p: AuthenticatedPrincipal,
    id: string,
    sessionId: string,
    meta: RequestMeta,
  ): Promise<void> {
    this.noImpersonation(p);
    if (!(await this.sessions.revoke(sessionId, new Date(), id)))
      throw new ProblemError('not_found', 'Session not found');
    await this.audit.record(
      {
        action: AuthEvents.sessionRevoked,
        entityType: 'session',
        entityId: sessionId,
        actor: actorOf(p),
        diff: { userId: id, byPlatform: true },
      },
      meta,
    );
  }

  /** Access token only, ≤ 60 min, `imp` claim; never of a platform owner or oneself (M01 §7.1). */
  async impersonate(
    p: AuthenticatedPrincipal,
    id: string,
    input: { workspaceId?: string | undefined; reason: string },
    meta: RequestMeta,
  ) {
    this.noImpersonation(p);
    const target = await this.users.findById(id);
    if (!target) throw notFound();
    if (target.id === p.userId || target.platformRole === 'platform_owner') {
      throw new ProblemError('forbidden', 'This user cannot be impersonated');
    }
    if (target.status !== 'active')
      throw new ProblemError('conflict', 'Only active users can be impersonated');
    const ws = await this.workspaceAccess.defaultWorkspace(target, [input.workspaceId]);
    const token = await this.tokens.signAccess(
      { sub: target.id, wid: ws?.workspaceId ?? null, sid: null, imp: p.userId },
      TTL.impersonationSec,
    );
    await this.audit.record(
      {
        action: AuthEvents.impersonationStarted,
        entityType: 'user',
        entityId: target.id,
        workspaceId: ws?.workspaceId ?? null,
        actor: { type: 'user', id: p.userId },
        diff: { reason: input.reason },
      },
      meta,
    );
    return {
      accessToken: token.token,
      tokenType: 'Bearer' as const,
      expiresIn: token.expiresIn,
      workspaceId: ws?.workspaceId ?? null,
    };
  }

  private noImpersonation(p: AuthenticatedPrincipal): void {
    if (p.impersonatorId) throw new ProblemError('forbidden', 'Not allowed while impersonating');
  }
}
