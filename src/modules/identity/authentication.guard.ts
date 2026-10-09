import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { type Redis } from 'ioredis';
import { MFA_ENROLLMENT_KEY, PUBLIC_KEY } from '../../common/auth/decorators';
import { type AuthenticatedPrincipal, type RequestWithPrincipal } from '../../common/auth/principal';
import { ProblemError } from '../../common/errors/problem';
import { requestMetaOf } from '../../common/http/request-meta';
import { REDIS } from '../../infra/redis/redis.module';
import { AuditService } from '../audit';
import { AuthEvents } from './events';
import { SessionsService } from './sessions.service';
import { TokenService } from './token.service';
import { UsersRepository } from './users.repository';
import { WorkspaceAccessService } from './workspace-access.service';

const BEARER_RE = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/;

/**
 * Resolves the caller from the bearer token on every request (runs before AuthorizationGuard).
 * User status, session revocation, membership/grant and entitlements are re-checked each time,
 * so removals and revocations take effect on the next request (M01 §7.1, US-01-3).
 */
@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly users: UsersRepository,
    private readonly sessions: SessionsService,
    private readonly access: WorkspaceAccessService,
    private readonly audit: AuditService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & RequestWithPrincipal>();
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets) ?? false;
    const header = req.headers.authorization;
    if (!header) return true; // AuthorizationGuard decides whether anonymous is fine
    const token = BEARER_RE.exec(header)?.[1];

    const principal = token
      ? ((await this.fromAccessToken(token)) ??
        (this.reflector.getAllAndOverride<boolean>(MFA_ENROLLMENT_KEY, targets)
          ? await this.fromEnrollmentToken(token)
          : null))
      : null;
    if (!principal) {
      if (isPublic) return true; // e.g. an expired token sent to /auth/login
      throw new ProblemError('unauthenticated', 'Authentication required', 'Invalid or expired access token');
    }
    req.principal = principal;
    if (principal.crossTenant) {
      await this.audit.record(
        {
          action: AuthEvents.crossTenantAccess,
          entityType: 'route',
          entityId: `${req.method} ${req.route ? String((req.route as { path?: unknown }).path) : req.path}`,
          workspaceId: principal.workspaceId,
          actor: { type: 'user', id: principal.userId, impersonatorId: principal.impersonatorId },
          diff: { platformRole: principal.platformRole },
        },
        requestMetaOf(req),
      );
    }
    return true;
  }

  private async fromAccessToken(token: string): Promise<AuthenticatedPrincipal | null> {
    const claims = await this.tokens.verifyAccess(token);
    if (!claims) return null;
    const user = await this.users.findById(claims.sub);
    if (!user || user.status !== 'active') return null;
    if (claims.sid && !(await this.sessions.isActive(claims.sid, user.id))) return null;
    if (claims.imp) {
      const impersonator = await this.users.findById(claims.imp);
      if (!impersonator || impersonator.status !== 'active' || impersonator.platformRole !== 'platform_owner')
        return null;
      if (await this.redis.exists(`revoked-jti:${claims.jti}`)) return null;
    } else if (!claims.sid) {
      return null; // only impersonation tokens may exist without a session
    }
    const access = claims.wid ? await this.access.resolve(user, claims.wid) : null;
    return this.access.principalFor(user, access, {
      sessionId: claims.sid,
      impersonatorId: claims.imp,
      tokenId: claims.jti,
    });
  }

  private async fromEnrollmentToken(token: string): Promise<AuthenticatedPrincipal | null> {
    const claims = await this.tokens.verifyMfa(token, 'enroll');
    if (!claims) return null;
    const user = await this.users.findById(claims.sub);
    if (!user || user.status !== 'active' || user.mfaEnabledAt) return null;
    return {
      userId: user.id,
      sessionId: null,
      workspaceId: claims.wid,
      workspaceStatus: null,
      platformRole: null,
      role: null,
      permissions: new Set(),
      modules: new Set(),
      scope: { companyIds: [], projectIds: [] },
      impersonatorId: null,
      crossTenant: false,
      tokenId: null,
      mfaEnrollment: true,
    };
  }
}
