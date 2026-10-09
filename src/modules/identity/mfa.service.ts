import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { type Redis } from 'ioredis';
import { ProblemError } from '../../common/errors/problem';
import { type RequestMeta } from '../../common/http/request-meta';
import { type User } from '../../generated/prisma/client';
import { RateLimiter } from '../../infra/rate-limit/rate-limiter';
import { REDIS } from '../../infra/redis/redis.module';
import { AuditService } from '../audit';
import { hashToken } from './engine/tokens';
import { base32Encode, otpauthUri, verifyTotp } from './engine/totp';
import { identityEmails } from './emails';
import { AuthEvents } from './events';
import { IdentityMailer } from './identity-mailer';
import { PasswordService } from './password.service';
import { LIMITS } from './rate-limits';
import { TokenService } from './token.service';
import { UsersRepository } from './users.repository';

const RECOVERY_CODES = 10;

/** Recovery codes are shown once, formatted xxxxx-xxxxx; compared case-insensitively without dashes. */
const normaliseRecoveryCode = (code: string): string => code.replace(/[\s-]/g, '').toLowerCase();

/** TOTP MFA (M01 §4.2, §7.1). */
@Injectable()
export class MfaService {
  constructor(
    private readonly users: UsersRepository,
    private readonly tokens: TokenService,
    private readonly passwords: PasswordService,
    private readonly limiter: RateLimiter,
    private readonly audit: AuditService,
    private readonly mailer: IdentityMailer,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** Step 1: a new pending secret (replaces any unconfirmed one). */
  async setup(userId: string): Promise<{ secret: string; otpauthUri: string }> {
    const user = await this.mustGet(userId);
    if (user.mfaEnabledAt) throw new ProblemError('conflict', 'Two-factor authentication is already enabled');
    const secret = randomBytes(20);
    await this.users.update(user.id, { mfaTotpSecretEnc: this.tokens.seal(secret) });
    const b32 = base32Encode(secret);
    return { secret: b32, otpauthUri: otpauthUri(b32, user.email) };
  }

  /** Step 2: confirm with a code; enables MFA and returns one-time recovery codes. */
  async confirm(userId: string, code: string, meta: RequestMeta): Promise<{ recoveryCodes: string[] }> {
    const user = await this.mustGet(userId);
    if (user.mfaEnabledAt) throw new ProblemError('conflict', 'Two-factor authentication is already enabled');
    if (!user.mfaTotpSecretEnc) throw new ProblemError('conflict', 'Start two-factor setup first');
    await this.limiter.enforce(LIMITS.mfaUser, user.id);
    if (!(await this.checkTotp(user, code))) {
      throw new ProblemError('validation_failed', 'Invalid code', undefined, {
        errors: [{ path: 'code', message: 'Invalid code' }],
      });
    }
    const codes = Array.from({ length: RECOVERY_CODES }, () => {
      const raw = randomBytes(5).toString('hex');
      return `${raw.slice(0, 5)}-${raw.slice(5)}`;
    });
    await this.users.replaceRecoveryCodes(
      user.id,
      codes.map((c) => hashToken(normaliseRecoveryCode(c))),
      { mfaEnabledAt: new Date() },
    );
    await this.audit.record(
      {
        action: AuthEvents.mfaEnabled,
        entityType: 'user',
        entityId: user.id,
        actor: { type: 'user', id: user.id },
      },
      meta,
    );
    await this.mailer.send(identityEmails.mfaChanged(user.email, true));
    return { recoveryCodes: codes };
  }

  /** Second factor at login: a TOTP code (no reuse of a step) or an unused recovery code. */
  async verifySecondFactor(
    user: User,
    input: { code?: string | undefined; recoveryCode?: string | undefined },
  ): Promise<boolean> {
    await this.limiter.enforce(LIMITS.mfaUser, user.id);
    if (!user.mfaEnabledAt) return false;
    if (input.code) return this.checkTotp(user, input.code);
    if (input.recoveryCode) {
      return this.users.consumeRecoveryCode(
        user.id,
        hashToken(normaliseRecoveryCode(input.recoveryCode)),
        new Date(),
      );
    }
    return false;
  }

  async disable(userId: string, input: { password: string; code: string }, meta: RequestMeta): Promise<void> {
    const user = await this.mustGet(userId);
    if (user.platformRole)
      throw new ProblemError('forbidden', 'Two-factor authentication is mandatory for platform roles');
    if (!user.mfaEnabledAt) throw new ProblemError('conflict', 'Two-factor authentication is not enabled');
    await this.limiter.enforce(LIMITS.passwordCheckUser, user.id);
    const ok =
      (await this.passwords.verify(input.password, { hash: user.passwordHash, algo: user.passwordAlgo })) &&
      (await this.checkTotp(user, input.code));
    if (!ok) throw new ProblemError('forbidden', 'Password or code is incorrect');
    await this.users.disableMfa(user.id);
    await this.audit.record(
      {
        action: AuthEvents.mfaDisabled,
        entityType: 'user',
        entityId: user.id,
        actor: { type: 'user', id: user.id },
      },
      meta,
    );
    await this.mailer.send(identityEmails.mfaChanged(user.email, false));
  }

  private async checkTotp(user: User, code: string): Promise<boolean> {
    if (!user.mfaTotpSecretEnc) return false;
    const step = verifyTotp(this.tokens.open(user.mfaTotpSecretEnc), code, Date.now());
    if (step === null) return false;
    // A code (time step) can be used once: replay within its validity window is rejected.
    const fresh = await this.redis.set(`totp:${user.id}:${step}`, '1', 'EX', 120, 'NX');
    return fresh === 'OK';
  }

  private async mustGet(userId: string): Promise<User> {
    const user = await this.users.findById(userId);
    if (!user || user.status !== 'active')
      throw new ProblemError('unauthenticated', 'Authentication required');
    return user;
  }
}
