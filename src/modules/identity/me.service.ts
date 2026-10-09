import { Injectable } from '@nestjs/common';
import { type AuthenticatedPrincipal } from '../../common/auth/principal';
import { ProblemError } from '../../common/errors/problem';
import { type RequestMeta } from '../../common/http/request-meta';
import { AppConfig } from '../../config/app-config';
import { type Prisma, type User } from '../../generated/prisma/client';
import { RateLimiter } from '../../infra/rate-limit/rate-limiter';
import { AuditService } from '../audit';
import { AccessRepository } from './access.repository';
import { AuthService } from './auth.service';
import { identityEmails } from './emails';
import { effectivePermissions } from './engine/permissions';
import { AuthEvents } from './events';
import { IdentityMailer } from './identity-mailer';
import { PasswordService } from './password.service';
import { LIMITS } from './rate-limits';
import { SessionsService } from './sessions.service';
import { TokenService } from './token.service';
import { UsersRepository } from './users.repository';
import { WorkspaceAccessService } from './workspace-access.service';

const actorOf = (p: AuthenticatedPrincipal) => ({
  type: 'user' as const,
  id: p.userId,
  impersonatorId: p.impersonatorId,
});

export const toProfile = (u: User) => ({
  id: u.id,
  email: u.email,
  emailVerified: !!u.emailVerifiedAt,
  name: u.name,
  jobTitle: u.jobTitle,
  phone: u.phone,
  locale: u.locale,
  timezone: u.timezone,
  theme: u.theme,
  avatarFileId: u.avatarFileId,
  platformRole: u.platformRole,
  mfaEnabled: !!u.mfaEnabledAt,
  status: u.status,
  lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
  termsVersion: u.termsVersion,
  termsAcceptedAt: u.termsAcceptedAt?.toISOString() ?? null,
});

/** The signed-in user's own account (M01 §4.1, §8 `/me`). */
@Injectable()
export class MeService {
  constructor(
    private readonly users: UsersRepository,
    private readonly access: AccessRepository,
    private readonly workspaceAccess: WorkspaceAccessService,
    private readonly sessions: SessionsService,
    private readonly tokens: TokenService,
    private readonly passwords: PasswordService,
    private readonly auth: AuthService,
    private readonly limiter: RateLimiter,
    private readonly audit: AuditService,
    private readonly mailer: IdentityMailer,
    private readonly config: AppConfig,
  ) {}

  async me(p: AuthenticatedPrincipal) {
    const user = await this.mustGet(p.userId);
    const now = new Date();
    const { memberships, grants } = await this.access.accessibleWorkspaces(user.id, now);
    const seen = new Set(memberships.map((m) => m.workspaceId));
    const current = p.workspaceId ? await this.access.getWorkspace(p.workspaceId) : null;
    const entitlements = p.workspaceId ? await this.access.entitlements(p.workspaceId) : null;
    const impersonator = p.impersonatorId ? await this.users.findById(p.impersonatorId) : null;
    return {
      user: toProfile(user),
      currentWorkspace: current
        ? { ...current, role: p.role, crossTenant: p.crossTenant, scope: p.scope }
        : null,
      memberships: [
        ...memberships.map((m) => ({
          workspaceId: m.workspaceId,
          workspaceName: m.workspace.name,
          role: m.role,
          via: 'membership' as const,
        })),
        ...grants
          .filter((g) => !seen.has(g.clientWorkspaceId) && seen.add(g.clientWorkspaceId))
          .map((g) => ({
            workspaceId: g.clientWorkspaceId,
            workspaceName: g.clientWorkspace.name,
            role: 'partner_admin',
            via: 'partner_grant' as const,
          })),
      ],
      permissions: effectivePermissions(p.permissions, p.modules, !!p.workspaceId),
      entitlements: entitlements
        ? {
            plan: entitlements.plan,
            modules: entitlements.modules,
            limits: entitlements.limits as Record<string, unknown>,
          }
        : null,
      impersonatedBy: impersonator ? { id: impersonator.id, name: impersonator.name } : null,
      termsAcceptanceRequired: user.termsVersion !== this.config.get('TERMS_VERSION'),
      currentTermsVersion: this.config.get('TERMS_VERSION'),
    };
  }

  async updateProfile(p: AuthenticatedPrincipal, patch: Prisma.UserUpdateInput, meta: RequestMeta) {
    const user = await this.users.update(p.userId, patch);
    await this.audit.record(
      {
        action: AuthEvents.profileUpdated,
        entityType: 'user',
        entityId: user.id,
        actor: actorOf(p),
        diff: { fields: Object.keys(patch) },
      },
      meta,
    );
    return toProfile(user);
  }

  async changePassword(
    p: AuthenticatedPrincipal,
    input: { currentPassword: string; newPassword: string },
    meta: RequestMeta,
  ) {
    this.noImpersonation(p);
    const user = await this.mustGet(p.userId);
    await this.limiter.enforce(LIMITS.passwordCheckUser, user.id);
    if (
      !(await this.passwords.verify(input.currentPassword, {
        hash: user.passwordHash,
        algo: user.passwordAlgo,
      }))
    ) {
      throw new ProblemError('forbidden', 'Current password is incorrect');
    }
    await this.passwords.assertAcceptable(input.newPassword, [user.email, user.name], 'newPassword');
    await this.users.update(user.id, {
      passwordHash: await this.passwords.hash(input.newPassword),
      passwordAlgo: 'argon2id',
    });
    await this.sessions.revokeAll(user.id, p.sessionId);
    await this.mailer.send(identityEmails.passwordChanged(user.email));
    await this.audit.record(
      { action: AuthEvents.passwordChanged, entityType: 'user', entityId: user.id, actor: actorOf(p) },
      meta,
    );
  }

  /** Sends a verification link to the new address; the change applies on verification (M01 §7.1). */
  async changeEmail(p: AuthenticatedPrincipal, input: { newEmail: string; password: string }): Promise<void> {
    this.noImpersonation(p);
    const user = await this.mustGet(p.userId);
    await this.limiter.enforce(LIMITS.passwordCheckUser, user.id);
    if (
      !(await this.passwords.verify(input.password, { hash: user.passwordHash, algo: user.passwordAlgo }))
    ) {
      throw new ProblemError('forbidden', 'Password is incorrect');
    }
    if (input.newEmail.toLowerCase() === user.email.toLowerCase()) return;
    if (await this.users.findByEmail(input.newEmail)) return; // same response: no enumeration
    await this.auth.sendVerification(user, 'email_change', input.newEmail, {});
  }

  async acceptTerms(p: AuthenticatedPrincipal, version: string, meta: RequestMeta): Promise<void> {
    this.noImpersonation(p);
    if (version !== this.config.get('TERMS_VERSION')) {
      throw new ProblemError('validation_failed', 'Unknown terms version', undefined, {
        errors: [{ path: 'version', message: `Current version is ${this.config.get('TERMS_VERSION')}` }],
      });
    }
    await this.users.update(p.userId, { termsVersion: version, termsAcceptedAt: new Date() });
    await this.audit.record(
      {
        action: AuthEvents.termsAccepted,
        entityType: 'user',
        entityId: p.userId,
        actor: actorOf(p),
        diff: { version },
      },
      meta,
    );
  }

  /** Workspace switcher (US-01-3): re-issues the access token with the new `wid`. */
  async switchWorkspace(p: AuthenticatedPrincipal, workspaceId: string, meta: RequestMeta) {
    if (p.impersonatorId) throw new ProblemError('conflict', 'End the impersonation to switch workspace');
    const user = await this.mustGet(p.userId);
    const access = await this.workspaceAccess.resolve(user, workspaceId);
    if (!access) throw new ProblemError('not_found', 'Workspace not found');
    if (p.sessionId) await this.sessions.setWorkspace(p.sessionId, workspaceId);
    const token = await this.tokens.signAccess({ sub: user.id, wid: workspaceId, sid: p.sessionId });
    await this.audit.record(
      {
        action: AuthEvents.workspaceSwitched,
        entityType: 'workspace',
        entityId: workspaceId,
        workspaceId,
        actor: actorOf(p),
        diff: { from: p.workspaceId, crossTenant: access.crossTenant },
      },
      meta,
    );
    return {
      accessToken: token.token,
      tokenType: 'Bearer' as const,
      expiresIn: token.expiresIn,
      workspaceId,
    };
  }

  listSessions(p: AuthenticatedPrincipal) {
    return this.sessions.list(p.userId, p.sessionId);
  }

  async revokeSession(p: AuthenticatedPrincipal, sessionId: string, meta: RequestMeta): Promise<void> {
    if (!(await this.sessions.revoke(sessionId, new Date(), p.userId)))
      throw new ProblemError('not_found', 'Session not found');
    await this.audit.record(
      { action: AuthEvents.sessionRevoked, entityType: 'session', entityId: sessionId, actor: actorOf(p) },
      meta,
    );
  }

  /** Credentials and consent are never changed by an impersonator (M01 §4.2). */
  private noImpersonation(p: AuthenticatedPrincipal): void {
    if (p.impersonatorId) throw new ProblemError('forbidden', 'Not allowed while impersonating');
  }

  private async mustGet(userId: string): Promise<User> {
    const user = await this.users.findById(userId);
    if (!user || user.status !== 'active')
      throw new ProblemError('unauthenticated', 'Authentication required');
    return user;
  }
}
