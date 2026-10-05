import fc from 'fast-check';
import { PERMISSIONS, type Permission } from '../../../common/auth/decorators';
import {
  MEMBERSHIP_ROLES,
  MODULES,
  PLATFORM_ROLES,
  type ModuleName,
  type WorkspaceRole,
} from '../../../common/auth/principal';
import { uuidv7 } from '../../../common/ids';
import { parseCsv } from './invite-csv';
import { isLocked, LOCKOUT, lockAfterFailure } from './lockout';
import { checkPasswordPolicy, PASSWORD_POLICY } from './password-policy';
import {
  canGrantRole,
  canManageMember,
  decidePermission,
  effectivePermissions,
  resolvePermissions,
  type RoleActor,
} from './permissions';
import { decodeTenantToken, encodeTenantToken, hashToken, isTokenUsable } from './tokens';
import { base32Decode, base32Encode, hotp, TOTP, totp, totpStep, verifyTotp } from './totp';

/**
 * Property-based tests (CI test plan B2): invariants the M01 rules imply, checked on generated
 * inputs rather than hand-picked cases. A failure prints the seed and the shrunk counterexample.
 */
const workspaceRole = fc.constantFrom<WorkspaceRole>(...MEMBERSHIP_ROLES, 'partner_admin');
const actor = fc.constantFrom<RoleActor>(...MEMBERSHIP_ROLES, 'partner_admin', 'platform_owner');
const modules = fc.uniqueArray(fc.constantFrom<ModuleName>(...MODULES)).map((m) => new Set(m));
const permission = fc.constantFrom<Permission>(...PERMISSIONS);
const instant = fc.date({ min: new Date('2000-01-01'), max: new Date('2100-01-01'), noInvalidDate: true });

describe('permissions (M01 §2, M02 §7)', () => {
  const granted = fc
    .record({
      platformRole: fc.option(fc.constantFrom(...PLATFORM_ROLES)),
      workspaceRole: fc.option(workspaceRole),
    })
    .map(resolvePermissions);

  it('never allows a permission the roles do not grant (unless platform:*)', () => {
    fc.assert(
      fc.property(permission, granted, modules, fc.boolean(), (p, g, m, inWs) => {
        if (decidePermission(p, g, m, inWs).allowed) expect(g.has(p) || g.has('platform:*')).toBe(true);
      }),
    );
  });

  it('effective permissions are granted ones, and grow with entitlements', () => {
    fc.assert(
      fc.property(granted, modules, modules, fc.boolean(), (g, a, b, inWs) => {
        const fewer = effectivePermissions(g, a, inWs);
        const more = effectivePermissions(g, new Set([...a, ...b]), inWs);
        for (const p of fewer) expect(g.has(p)).toBe(true);
        expect(more).toEqual(expect.arrayContaining(fewer));
      }),
    );
  });

  it('a role that may be granted may also be managed; partner_admin is never granted', () => {
    fc.assert(
      fc.property(actor, workspaceRole, (a, role) => {
        if (canGrantRole(a, role)) expect(canManageMember(a, role)).toBe(true);
        if (role === 'partner_admin') expect(canGrantRole(a, role)).toBe(false);
        if (['contributor', 'viewer', 'auditor'].includes(a)) expect(canManageMember(a, role)).toBe(false);
      }),
    );
  });
});

describe('tokens (M01 §6, US-01-2)', () => {
  it('tenant tokens round-trip the workspace id', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 32, maxLength: 32 }), (bytes) => {
        const workspaceId = uuidv7();
        expect(decodeTenantToken(encodeTenantToken(workspaceId, Buffer.from(bytes)))).toEqual({
          workspaceId,
        });
      }),
    );
  });

  it('decoding arbitrary input never throws', () => {
    fc.assert(fc.property(fc.string({ maxLength: 100 }), (s) => void decodeTenantToken(s)));
  });

  it('hashes are 64 hex chars and deterministic', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(hashToken(s)).toMatch(/^[0-9a-f]{64}$/);
        expect(hashToken(s)).toBe(hashToken(s));
      }),
    );
  });

  it('a token is usable strictly before expiry and never after use or revocation', () => {
    fc.assert(
      fc.property(instant, instant, fc.option(instant), fc.option(instant), (now, exp, used, revoked) => {
        const usable = isTokenUsable({ expiresAt: exp, usedAt: used, revokedAt: revoked }, now);
        expect(usable).toBe(!used && !revoked && now < exp);
      }),
    );
  });
});

describe('TOTP (M01 §7.1, RFC 6238)', () => {
  const secret = fc.uint8Array({ minLength: 20, maxLength: 20 }).map((b) => Buffer.from(b));
  const nowMs = fc.integer({ min: 60_000, max: 4_102_444_800_000 });

  it('base32 round-trips any bytes, ignoring case and spaces', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 64 }), (bytes) => {
        const encoded = base32Encode(Buffer.from(bytes));
        expect(base32Decode(encoded)).toEqual(Buffer.from(bytes));
        expect(base32Decode(encoded.toLowerCase().replace(/(.{4})/g, '$1 '))).toEqual(Buffer.from(bytes));
      }),
    );
  });

  it('codes are 6 digits and verify within ±1 step only', () => {
    fc.assert(
      fc.property(secret, nowMs, fc.integer({ min: -3, max: 3 }), (s, now, drift) => {
        const code = totp(s, now);
        expect(code).toMatch(/^\d{6}$/);
        const shifted = now + drift * TOTP.stepSec * 1000;
        const matched = verifyTotp(s, code, shifted);
        if (Math.abs(drift) <= TOTP.window) expect(matched).toBe(totpStep(now));
        else if (matched !== null) expect(hotp(s, matched)).toBe(code); // only a genuine collision
      }),
    );
  });
});

describe('lockout (M01 §4.1)', () => {
  it('locks exactly from the 10th failure, for 15 minutes', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 50 }), instant, (failures, now) => {
        const lockedUntil = lockAfterFailure(failures, now);
        expect(isLocked(lockedUntil, now)).toBe(failures >= LOCKOUT.maxFailures);
        expect(isLocked(lockedUntil, new Date(now.getTime() + LOCKOUT.lockMs))).toBe(false);
      }),
    );
  });
});

describe('password policy (US-01-1)', () => {
  it('rejects by length before strength, counting code points', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'grapheme-ascii', maxLength: 11 }), (short) => {
        expect(checkPasswordPolicy(short)).toEqual(['too_short']);
      }),
    );
    fc.assert(
      fc.property(
        fc.string({ unit: 'binary', minLength: PASSWORD_POLICY.maxLength + 1, maxLength: 400 }),
        (long) => {
          fc.pre([...long].length > PASSWORD_POLICY.maxLength);
          expect(checkPasswordPolicy(long)).toEqual(['too_long']);
        },
      ),
      { numRuns: 30 },
    );
  });
});

describe('invite CSV (M01 §8)', () => {
  const cell = fc.string({ maxLength: 20 });
  const row = fc.array(cell, { minLength: 1, maxLength: 5 }).filter((r) => r.some((c) => c.trim() !== ''));
  const quote = (c: string) => `"${c.replace(/"/g, '""')}"`;

  it('parses what an RFC 4180 writer produces, with LF or CRLF', () => {
    fc.assert(
      fc.property(fc.array(row, { maxLength: 10 }), fc.constantFrom('\n', '\r\n'), (rows, eol) => {
        const text = rows.map((r) => r.map(quote).join(',')).join(eol);
        expect(parseCsv(text)).toEqual(rows);
      }),
    );
  });

  it('never throws on arbitrary text', () => {
    fc.assert(fc.property(fc.string({ maxLength: 300 }), (s) => void parseCsv(s)));
  });
});
