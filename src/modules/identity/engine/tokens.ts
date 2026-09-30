import { createHash } from 'node:crypto';
import { UUID_RE } from '../../../common/ids';

/** Lifetimes (M01 §5, §7.1, ADR-005). */
export const TTL = {
  accessTokenSec: 15 * 60,
  impersonationSec: 60 * 60,
  mfaChallengeSec: 5 * 60,
  mfaEnrollmentSec: 15 * 60,
  refreshTokenMs: 30 * 24 * 3600 * 1000,
  passwordResetMs: 15 * 60 * 1000,
  emailVerificationMs: 24 * 3600 * 1000,
  invitationMs: 7 * 24 * 3600 * 1000,
} as const;

/** Tokens are stored as SHA-256 hex only (US-01-2). */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function expiresAt(now: Date, ttlMs: number): Date {
  return new Date(now.getTime() + ttlMs);
}

/** A token is usable strictly before its expiry and only once. */
export function isTokenUsable(
  token: { expiresAt: Date; usedAt?: Date | null; revokedAt?: Date | null },
  now: Date,
): boolean {
  return !token.usedAt && !token.revokedAt && now.getTime() < token.expiresAt.getTime();
}

const uuidToBytes = (uuid: string): Buffer => Buffer.from(uuid.replace(/-/g, ''), 'hex');
const bytesToUuid = (b: Buffer): string => {
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
};

/**
 * Invitation tokens embed the workspace id (16 bytes) before 32 random bytes, so the public
 * accept route can open the tenant (RLS) context before looking up the hash (M01 §6).
 */
export function encodeTenantToken(workspaceId: string, secret: Buffer): string {
  if (!UUID_RE.test(workspaceId) || secret.length !== 32) throw new Error('invalid token parts');
  return Buffer.concat([uuidToBytes(workspaceId), secret]).toString('base64url');
}

export function decodeTenantToken(token: string): { workspaceId: string } | null {
  if (!/^[A-Za-z0-9_-]{64}$/.test(token)) return null;
  const raw = Buffer.from(token, 'base64url');
  if (raw.length !== 48) return null;
  const workspaceId = bytesToUuid(raw.subarray(0, 16));
  return UUID_RE.test(workspaceId) ? { workspaceId } : null;
}
