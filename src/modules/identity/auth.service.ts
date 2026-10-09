import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { type Redis } from 'ioredis';
import { type AuthenticatedPrincipal } from '../../common/auth/principal';
import { ProblemError } from '../../common/errors/problem';
import { type RequestMeta } from '../../common/http/request-meta';
import { AppConfig } from '../../config/app-config';
import { type User } from '../../generated/prisma/client';
import { RateLimiter } from '../../infra/rate-limit/rate-limiter';
import { REDIS } from '../../infra/redis/redis.module';
import { AuditService } from '../audit';
import { AccessRepository } from './access.repository';
import { identityEmails } from './emails';
import { isLocked, lockAfterFailure } from './engine/lockout';
import { expiresAt, hashToken, isTokenUsable, TTL } from './engine/tokens';
import { AuthEvents } from './events';
import { IdentityMailer } from './identity-mailer';
import { MfaService } from './mfa.service';
import { PasswordService } from './password.service';
import { LIMITS } from './rate-limits';
import { type IssuedSession, SessionsService } from './sessions.service';
import { TokenService } from './token.service';
import { UsersRepository } from './users.repository';

export type LoginResult =
  IssuedSession | { mfaRequired: true; mfaToken: string } | { mfaEnrollmentRequired: true; mfaToken: string };

const invalidCredentials = () => new ProblemError('unauthenticated', 'Invalid email or password');
const invalidToken = () => new ProblemError('invalid_token', 'This link is invalid or has expired');
const ip = (meta: RequestMeta) => meta.ip ?? 'unknown';

/** Sign-in, sign-up, email verification and password reset (M01 §4.1, §5, §7.1). */
@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly access: AccessRepository,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionsService,
    private readonly tokens: TokenService,
    private readonly mfa: MfaService,
    private readonly limiter: RateLimiter,
    private readonly audit: AuditService,
    private readonly mailer: IdentityMailer,
    private readonly config: AppConfig,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async login(
    input: { email: string; password: string; workspaceId?: string | undefined },
    res: Response,
    meta: RequestMeta,
  ): Promise<LoginResult> {
    await this.limiter.enforce(LIMITS.loginIp, ip(meta));
    const now = new Date();
    const user = await this.users.findByEmail(input.email);
    const failed = (reason: string, u: User | null) =>
      this.audit.record(
        {
          action: AuthEvents.loginFailed,
          entityType: 'user',
          entityId: u?.id ?? null,
          actor: u ? { type: 'user', id: u.id } : { type: 'anonymous' },
          diff: { reason },
        },
        meta,
      );

    if (!user) {
      await this.passwords.verify(input.password, { hash: null, algo: 'argon2id' });
      await failed('unknown_user', null);
      throw invalidCredentials();
    }
    if (isLocked(user.lockedUntil, now)) {
      await failed('locked', user);
      throw invalidCredentials();
    }
    const ok = await this.passwords.verify(input.password, {
      hash: user.passwordHash,
      algo: user.passwordAlgo,
    });
    if (!ok) {
      const hit = await this.limiter.hit(LIMITS.loginFailures, user.id);
      const lockedUntil = lockAfterFailure(LIMITS.loginFailures.limit - hit.remaining, now);
      await this.users.update(user.id, {
        failedLoginCount: { increment: 1 },
        ...(lockedUntil ? { lockedUntil } : {}),
      });
      await failed(lockedUntil ? 'bad_password_locked' : 'bad_password', user);
      throw invalidCredentials();
    }
    if (user.status !== 'active') {
      await failed('inactive', user);
      throw invalidCredentials();
    }
    if (!user.emailVerifiedAt) {
      throw new ProblemError(
        'email_not_verified',
        'Confirm your email address first',
        'Check your inbox or request a new link',
      );
    }

    await this.limiter.reset(LIMITS.loginFailures, user.id);
    await this.users.update(user.id, {
      failedLoginCount: 0,
      lockedUntil: null,
      // Legacy bcrypt hashes are upgraded to argon2id at the first successful login (M01 §7).
      ...(user.passwordAlgo === 'bcrypt'
        ? { passwordHash: await this.passwords.hash(input.password), passwordAlgo: 'argon2id' as const }
        : {}),
    });

    if (user.mfaEnabledAt) {
      return {
        mfaRequired: true,
        mfaToken: await this.tokens.signMfa({
          sub: user.id,
          purpose: 'challenge',
          wid: input.workspaceId ?? null,
        }),
      };
    }
    if (user.platformRole) {
      return {
        mfaEnrollmentRequired: true,
        mfaToken: await this.tokens.signMfa({
          sub: user.id,
          purpose: 'enroll',
          wid: input.workspaceId ?? null,
        }),
      };
    }
    return this.completeLogin(user, res, meta, input.workspaceId ?? null, false);
  }

  async verifyMfa(
    input: { mfaToken: string; code?: string | undefined; recoveryCode?: string | undefined },
    res: Response,
    meta: RequestMeta,
  ): Promise<IssuedSession> {
    const claims = await this.tokens.verifyMfa(input.mfaToken, 'challenge');
    const user = claims && (await this.users.findById(claims.sub));
    if (!claims || !user || user.status !== 'active')
      throw new ProblemError('unauthenticated', 'Sign in again');
    if (!(await this.mfa.verifySecondFactor(user, input))) {
      await this.audit.record(
        {
          action: AuthEvents.loginFailed,
          entityType: 'user',
          entityId: user.id,
          actor: { type: 'user', id: user.id },
          diff: { reason: 'bad_mfa_code' },
        },
        meta,
      );
      throw new ProblemError('unauthenticated', 'Invalid code');
    }
    return this.completeLogin(user, res, meta, claims.wid, true);
  }

  /** Called after MFA enrolment by platform users (enrolment token → full session). */
  async completeLogin(
    user: User,
    res: Response,
    meta: RequestMeta,
    workspaceId: string | null,
    mfa: boolean,
  ): Promise<IssuedSession> {
    const session = await this.sessions.start(user, res, meta, workspaceId);
    await this.users.update(user.id, { lastLoginAt: new Date() });
    await this.audit.record(
      {
        action: AuthEvents.loginSucceeded,
        entityType: 'user',
        entityId: user.id,
        actor: { type: 'user', id: user.id },
        diff: { mfa },
      },
      meta,
    );
    return session;
  }

  async logout(
    principal: AuthenticatedPrincipal,
    all: boolean,
    res: Response,
    meta: RequestMeta,
  ): Promise<void> {
    if (all) await this.sessions.revokeAll(principal.userId);
    else if (principal.sessionId)
      await this.sessions.revoke(principal.sessionId, new Date(), principal.userId);
    this.sessions.clearCookie(res);
    await this.audit.record(
      {
        action: AuthEvents.logout,
        entityType: 'session',
        entityId: principal.sessionId,
        actor: { type: 'user', id: principal.userId, impersonatorId: principal.impersonatorId },
        diff: { all },
      },
      meta,
    );
  }

  // ─── self-service sign-up + email verification (M01 §7.1) ───

  async signup(
    input: { name: string; email: string; password: string; workspaceName: string },
    meta: RequestMeta,
  ): Promise<void> {
    await this.limiter.enforce(LIMITS.signupIp, ip(meta));
    await this.passwords.assertAcceptable(input.password, [input.email, input.name]);
    // Hash before looking up the email so both branches cost the same (no enumeration by timing).
    const passwordHash = await this.passwords.hash(input.password);
    const existing = await this.users.findByEmail(input.email);
    if (existing) {
      await this.mailer.send(
        identityEmails.accountExists(existing.email, {
          signInUrl: this.mailer.link('/sign-in'),
          resetUrl: this.mailer.link('/forgot-password'),
        }),
      );
      return;
    }
    const user = await this.users.create({
      email: input.email,
      name: input.name,
      passwordHash,
      passwordAlgo: 'argon2id',
      status: 'active',
    });
    await this.sendVerification(user, 'signup', user.email, { workspaceName: input.workspaceName });
    await this.audit.record(
      {
        action: AuthEvents.signup,
        entityType: 'user',
        entityId: user.id,
        actor: { type: 'user', id: user.id },
      },
      meta,
    );
  }

  async resendVerification(email: string, meta: RequestMeta): Promise<void> {
    await this.limiter.enforce(LIMITS.verifyIp, ip(meta));
    if (!(await this.limiter.hit(LIMITS.resendEmail, email)).allowed) return;
    const user = await this.users.findByEmail(email);
    if (!user || user.emailVerifiedAt || user.status !== 'active') return;
    const last = await this.users.latestSignupVerification(user.id);
    await this.sendVerification(
      user,
      'signup',
      user.email,
      (last?.payload as Record<string, unknown> | null) ?? {},
    );
  }

  async sendVerification(
    user: Pick<User, 'id'>,
    purpose: 'signup' | 'email_change',
    email: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const token = this.tokens.randomToken();
    await this.users.createEmailVerification({
      userId: user.id,
      email,
      purpose,
      payload: payload as object,
      tokenHash: hashToken(token),
      expiresAt: expiresAt(new Date(), TTL.emailVerificationMs),
    });
    await this.mailer.send(
      identityEmails.verifyEmail(email, { url: this.mailer.link('/verify-email', token) }),
    );
  }

  async verifyEmail(token: string, meta: RequestMeta): Promise<{ purpose: 'signup' | 'email_change' }> {
    await this.limiter.enforce(LIMITS.verifyIp, ip(meta));
    const now = new Date();
    const row = await this.users.findEmailVerification(hashToken(token));
    if (!row || !isTokenUsable(row, now)) throw invalidToken();
    const user = await this.users.findById(row.userId);
    if (!user || user.status === 'disabled') throw invalidToken();
    const actor = { type: 'user' as const, id: user.id };

    if (row.purpose === 'email_change') {
      const taken = await this.users.findByEmail(row.email);
      if (taken && taken.id !== user.id)
        throw new ProblemError('conflict', 'This email address is already in use');
      if (!(await this.users.consumeEmailVerification(row.id, now))) throw invalidToken();
      const oldEmail = user.email;
      await this.users.update(user.id, { email: row.email, emailVerifiedAt: now });
      await this.mailer.send(identityEmails.emailChanged(oldEmail));
      await this.audit.record(
        { action: AuthEvents.emailChanged, entityType: 'user', entityId: user.id, actor },
        meta,
      );
      return { purpose: 'email_change' };
    }

    const needsWorkspace = (await this.access.countMemberships(user.id)) === 0;
    const workspaceName = (row.payload as { workspaceName?: unknown } | null)?.workspaceName;
    if (needsWorkspace && typeof workspaceName === 'string' && workspaceName.trim()) {
      const workspaceId = await this.access.createTrialWorkspace(
        {
          userId: user.id,
          name: workspaceName.trim(),
          slug: slugify(workspaceName),
          modules: this.config.get('TRIAL_MODULES'),
        },
        async (tx) => {
          if (!(await this.users.consumeEmailVerification(row.id, now, tx))) throw invalidToken();
          await tx.user.update({ where: { id: user.id }, data: { emailVerifiedAt: now } });
        },
      );
      await this.audit.record(
        [
          { action: AuthEvents.emailVerified, entityType: 'user', entityId: user.id, actor },
          {
            action: AuthEvents.workspaceCreated,
            entityType: 'workspace',
            entityId: workspaceId,
            workspaceId,
            actor,
            diff: { via: 'self_service' },
          },
          {
            action: AuthEvents.membershipCreated,
            entityType: 'membership',
            workspaceId,
            actor,
            diff: { role: 'workspace_owner' },
          },
        ],
        meta,
      );
    } else {
      if (!(await this.users.consumeEmailVerification(row.id, now))) throw invalidToken();
      await this.users.update(user.id, { emailVerifiedAt: now });
      await this.audit.record(
        { action: AuthEvents.emailVerified, entityType: 'user', entityId: user.id, actor },
        meta,
      );
    }
    return { purpose: 'signup' };
  }

  // ─── password reset (US-01-2) ───

  async forgotPassword(email: string, meta: RequestMeta): Promise<void> {
    await this.limiter.enforce(LIMITS.forgotIp, ip(meta));
    // Per-email limit is silent: the response must not differ (no enumeration).
    if (!(await this.limiter.hit(LIMITS.forgotEmail, email)).allowed) return;
    const user = await this.users.findByEmail(email);
    if (!user || user.status === 'disabled') return;
    const token = this.tokens.randomToken();
    await this.users.createPasswordReset(
      user.id,
      hashToken(token),
      expiresAt(new Date(), TTL.passwordResetMs),
    );
    await this.mailer.send(
      identityEmails.passwordReset(user.email, { url: this.mailer.link('/reset-password', token) }),
    );
    await this.audit.record(
      {
        action: AuthEvents.passwordResetRequested,
        entityType: 'user',
        entityId: user.id,
        actor: { type: 'anonymous' },
      },
      meta,
    );
  }

  async resetPassword(input: { token: string; password: string }, meta: RequestMeta): Promise<void> {
    await this.limiter.enforce(LIMITS.resetIp, ip(meta));
    const now = new Date();
    const reset = await this.users.findPasswordReset(hashToken(input.token));
    if (!reset || !isTokenUsable(reset, now)) throw invalidToken();
    const user = await this.users.findById(reset.userId);
    if (!user || user.status === 'disabled') throw invalidToken();
    await this.passwords.assertAcceptable(input.password, [user.email, user.name]);
    const done = await this.users.completePasswordReset(
      reset.id,
      user.id,
      {
        passwordHash: await this.passwords.hash(input.password),
        passwordAlgo: 'argon2id',
        failedLoginCount: 0,
        lockedUntil: null,
        ...(user.status === 'invited' ? { status: 'active' as const } : {}),
      },
      now,
    );
    if (!done) throw invalidToken();
    await this.limiter.reset(LIMITS.loginFailures, user.id);
    await this.mailer.send(identityEmails.passwordChanged(user.email));
    await this.audit.record(
      {
        action: AuthEvents.passwordResetCompleted,
        entityType: 'user',
        entityId: user.id,
        actor: { type: 'user', id: user.id },
      },
      meta,
    );
  }

  /** Ends an impersonation: the token id is denied until it would have expired anyway. */
  async endImpersonation(principal: AuthenticatedPrincipal, meta: RequestMeta): Promise<void> {
    if (!principal.impersonatorId || !principal.tokenId)
      throw new ProblemError('conflict', 'Not impersonating');
    await this.redis.set(`revoked-jti:${principal.tokenId}`, '1', 'EX', TTL.impersonationSec);
    await this.audit.record(
      {
        action: AuthEvents.impersonationEnded,
        entityType: 'user',
        entityId: principal.userId,
        workspaceId: principal.workspaceId,
        actor: { type: 'user', id: principal.impersonatorId },
      },
      meta,
    );
  }
}

/** URL slug with a random suffix (slugs are unique; names are not). No user input reaches a regex. */
export function slugify(name: string): string {
  const base = name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${base || 'workspace'}-${randomBytes(3).toString('hex')}`;
}
