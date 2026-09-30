import { Inject, Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import bcrypt from 'bcryptjs';
import { ProblemError } from '../../common/errors/problem';
import { BREACHED_PASSWORD_CHECKER, type BreachedPasswordChecker } from './breached-password';
import { checkPasswordPolicy } from './engine/password-policy';

export type PasswordAlgoName = 'argon2id' | 'bcrypt';

const MESSAGES = {
  too_short: 'Use at least 12 characters',
  too_long: 'Use at most 256 characters',
  too_weak: 'Choose a less predictable password',
  breached: 'This password appears in a known data breach; choose another',
} as const;

/** argon2id hashing (ADR-005), legacy bcrypt verification + upgrade (M01 §7), policy (US-01-1). */
@Injectable()
export class PasswordService {
  /** Verified against for unknown users so login timing does not reveal whether an email exists. */
  private dummyHash: Promise<string> | null = null;

  constructor(@Inject(BREACHED_PASSWORD_CHECKER) private readonly breached: BreachedPasswordChecker) {}

  hash(password: string): Promise<string> {
    return hash(password);
  }

  async verify(password: string, stored: { hash: string | null; algo: PasswordAlgoName }): Promise<boolean> {
    if (!stored.hash) {
      this.dummyHash ??= hash('timing-equaliser-not-a-password');
      await verify(await this.dummyHash, password).catch(() => false);
      return false;
    }
    if (stored.algo === 'bcrypt') return bcrypt.compare(password, stored.hash);
    return verify(stored.hash, password).catch(() => false);
  }

  /** Throws validation_failed with field errors when the password does not meet the policy. */
  async assertAcceptable(password: string, userInputs: string[], field = 'password'): Promise<void> {
    const issues: string[] = checkPasswordPolicy(password, userInputs);
    if (issues.length === 0 && (await this.breached.isBreached(password))) issues.push('breached');
    if (issues.length) {
      throw new ProblemError('validation_failed', 'Password does not meet the policy', undefined, {
        errors: issues.map((i) => ({ path: field, message: MESSAGES[i as keyof typeof MESSAGES], code: i })),
      });
    }
  }
}
