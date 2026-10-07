import fc from 'fast-check';
import {
  checkDeclared,
  contentDisposition,
  detectKinds,
  FILE_KINDS,
  MB,
  PURPOSE_RULES,
  safeFileName,
  storageKey,
  UPLOAD_PURPOSES,
  withinStorageQuota,
} from './file-rules';
import { assertSafeKey } from '../../../infra/storage/storage.adapter';

/** Property-based tests (CI test plan B2) for the M14 §2 file rules. */
describe('file rules — properties (M14 §2)', () => {
  it('a declaration is accepted only for a kind of the purpose and within its size limit', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...UPLOAD_PURPOSES),
        fc.string(),
        fc.string(),
        fc.integer({ min: 0, max: 100 * MB }),
        (purpose, name, mimeType, size) => {
          const r = checkDeclared(purpose, { name, mimeType, size });
          if (r.ok) {
            expect(PURPOSE_RULES[purpose].kinds).toContain(r.kind);
            expect(size).toBeLessThanOrEqual(PURPOSE_RULES[purpose].maxBytes);
          }
        },
      ),
    );
  });

  it('detection never throws and only returns known kinds', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 512 }), fc.uint8Array({ maxLength: 64 }), (head, tail) => {
        for (const k of detectKinds(head, tail)) expect(FILE_KINDS).toContain(k);
      }),
    );
  });

  it('safe names never contain path separators or control characters and are never empty', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 400 }), (name) => {
        const safe = safeFileName(name);
        expect(safe.length).toBeGreaterThan(0);
        expect(safe.length).toBeLessThanOrEqual(255);
        // eslint-disable-next-line no-control-regex
        expect(safe).not.toMatch(/[\\/\u0000-\u001f\u007f]/);
      }),
    );
  });

  it('a disposition header is always printable ASCII (no header injection)', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 300 }), fc.boolean(), (name, inline) => {
        expect(contentDisposition(name, inline)).toMatch(/^[\x20-\x7e]+$/);
      }),
    );
  });

  it('storage keys built from uuids are always safe keys', () => {
    fc.assert(
      fc.property(fc.uuid(), fc.constantFrom(...UPLOAD_PURPOSES), fc.uuid(), fc.uuid(), (w, p, f, v) => {
        expect(() => assertSafeKey(storageKey(w, p, f, v))).not.toThrow();
      }),
    );
  });

  it('the quota is monotonic: less usage never breaks a quota that more usage keeps', () => {
    const n = fc.integer({ min: 0, max: 1000 * MB });
    fc.assert(
      fc.property(
        fc.option(fc.integer({ min: 0, max: 1000 }), { nil: null }),
        n,
        n,
        (limit, used, adding) => {
          if (withinStorageQuota(limit, used, adding) && used > 0)
            expect(withinStorageQuota(limit, used - 1, adding)).toBe(true);
        },
      ),
    );
  });
});
