import { randomBytes } from 'node:crypto';
import { uuidv7 } from '../../../common/ids';
import { decodeTenantToken, encodeTenantToken, expiresAt, hashToken, isTokenUsable, TTL } from './tokens';

describe('token hashing & expiry', () => {
  it('hashes with SHA-256 hex', () => {
    expect(hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('password reset tokens live 15 minutes', () => {
    const now = new Date('2026-09-30T10:00:00Z');
    expect(expiresAt(now, TTL.passwordResetMs).toISOString()).toBe('2026-09-30T10:15:00.000Z');
  });

  const now = new Date('2026-09-30T10:00:00Z');
  it.each([
    ['valid', { expiresAt: new Date('2026-09-30T10:00:01Z') }, true],
    ['expiry boundary is exclusive', { expiresAt: now }, false],
    ['expired', { expiresAt: new Date('2026-09-30T09:59:59Z') }, false],
    ['used', { expiresAt: new Date('2026-09-30T11:00:00Z'), usedAt: now }, false],
    ['revoked', { expiresAt: new Date('2026-09-30T11:00:00Z'), revokedAt: now }, false],
  ])('%s', (_name, token, expected) => {
    expect(isTokenUsable(token, now)).toBe(expected);
  });
});

describe('tenant tokens (invitations)', () => {
  it('round-trips the workspace id', () => {
    const wid = uuidv7();
    const token = encodeTenantToken(wid, randomBytes(32));
    expect(token).toMatch(/^[A-Za-z0-9_-]{64}$/);
    expect(decodeTenantToken(token)).toEqual({ workspaceId: wid });
  });

  it.each(['', 'short', 'x'.repeat(64), `${'A'.repeat(63)}!`])('rejects malformed %j', (t) => {
    expect(decodeTenantToken(t)).toBeNull();
  });

  it('rejects bad parts', () => {
    expect(() => encodeTenantToken('nope', randomBytes(32))).toThrow();
    expect(() => encodeTenantToken(uuidv7(), randomBytes(8))).toThrow();
  });
});
