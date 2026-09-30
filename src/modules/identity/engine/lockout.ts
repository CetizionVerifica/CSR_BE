/** Account lockout (M01 §4.1, §7.1): 10 failed logins within 15 min lock the account for 15 min. */
export const LOCKOUT = { maxFailures: 10, windowSec: 15 * 60, lockMs: 15 * 60 * 1000 } as const;

export function isLocked(lockedUntil: Date | null, now: Date): boolean {
  return !!lockedUntil && lockedUntil.getTime() > now.getTime();
}

/** Given the failures counted in the current window (including this one), the new lock, if any. */
export function lockAfterFailure(failuresInWindow: number, now: Date): Date | null {
  return failuresInWindow >= LOCKOUT.maxFailures ? new Date(now.getTime() + LOCKOUT.lockMs) : null;
}
