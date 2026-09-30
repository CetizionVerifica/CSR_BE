import { createHash } from 'node:crypto';
import { Logger } from '@nestjs/common';

/** Breached-password check (M01 §7.1) behind an adapter so the provider stays swappable. */
export interface BreachedPasswordChecker {
  isBreached(password: string): Promise<boolean>;
}

export const BREACHED_PASSWORD_CHECKER = Symbol('BREACHED_PASSWORD_CHECKER');

/**
 * Have I Been Pwned range API with k-anonymity: only the first 5 hex chars of the SHA-1 leave the
 * process; `Add-Padding` hides the response size. Fails open (logs a warning) when unreachable.
 */
export class HibpChecker implements BreachedPasswordChecker {
  private readonly logger = new Logger(HibpChecker.name);

  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 3000,
  ) {}

  async isBreached(password: string): Promise<boolean> {
    const sha1 = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);
    try {
      const res = await this.fetchImpl(`https://api.pwnedpasswords.com/range/${prefix}`, {
        headers: { 'Add-Padding': 'true', 'User-Agent': 'ResiliSense-API' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const body = await res.text();
      return body.split('\n').some((line) => {
        const [hash, count] = line.trim().split(':');
        return hash === suffix && Number(count) > 0;
      });
    } catch (err) {
      this.logger.warn(`Breached-password check unavailable, allowing: ${(err as Error).message}`);
      return false;
    }
  }
}

export class DisabledBreachedPasswordChecker implements BreachedPasswordChecker {
  isBreached(): Promise<boolean> {
    return Promise.resolve(false);
  }
}
