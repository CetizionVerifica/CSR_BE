import fc from 'fast-check';
import {
  canRestore,
  confirmsCompanyName,
  limitsSchema,
  parseLimits,
  purgeBefore,
  restoreDeadline,
  withinLimit,
} from './limits';

/** Property-based tests (CI test plan B2) for the M02 §7 limit and soft-delete rules. */
const instant = fc.date({ min: new Date('2000-01-01'), max: new Date('2100-01-01'), noInvalidDate: true });

describe('limits (M02 §4.1, §7)', () => {
  it('parseLimits never throws and only returns valid limits', () => {
    fc.assert(
      fc.property(fc.anything(), (json) => {
        expect(limitsSchema.safeParse(parseLimits(json)).success).toBe(true);
      }),
    );
  });

  it('no limit means unlimited; within a limit stays within when using less', () => {
    const count = fc.integer({ min: 0, max: 1000 });
    fc.assert(
      fc.property(fc.option(count, { nil: undefined }), count, count, (max, used, adding) => {
        if (max === undefined) expect(withinLimit(max, used, adding)).toBe(true);
        else expect(withinLimit(max, used, adding)).toBe(used + adding <= max);
        if (used > 0 && withinLimit(max, used, adding)) expect(withinLimit(max, used - 1, adding)).toBe(true);
        expect(withinLimit(null, used, adding)).toBe(true);
      }),
    );
  });
});

describe('soft delete (M02 §4.1)', () => {
  it('restore is possible strictly inside the 30-day window, and purge takes exactly the rest', () => {
    fc.assert(
      fc.property(instant, instant, (deletedAt, now) => {
        const purged = deletedAt < purgeBefore(now);
        expect(canRestore(deletedAt, now)).toBe(now < restoreDeadline(deletedAt));
        expect(purged).toBe(restoreDeadline(deletedAt) < now);
        if (purged) expect(canRestore(deletedAt, now)).toBe(false);
      }),
    );
  });

  it('the deadline itself is no longer restorable, a millisecond before still is', () => {
    fc.assert(
      fc.property(instant, (deletedAt) => {
        const deadline = restoreDeadline(deletedAt);
        expect(canRestore(deletedAt, deadline)).toBe(false);
        expect(canRestore(deletedAt, new Date(deadline.getTime() - 1))).toBe(true);
      }),
    );
  });

  it('a company name is confirmed whatever its case and spacing, and an empty one never', () => {
    const word = fc.stringMatching(/^[A-Za-z0-9&.-]{1,12}$/);
    const name = fc.array(word, { minLength: 1, maxLength: 4 }).map((w) => w.join(' '));
    fc.assert(
      fc.property(name, name, (display, legal) => {
        const company = { displayName: display, legalName: legal };
        expect(confirmsCompanyName(`  ${display.toUpperCase()} `, company)).toBe(true);
        expect(confirmsCompanyName(legal.toLowerCase().replace(/ /g, '   '), company)).toBe(true);
        expect(confirmsCompanyName('', company)).toBe(false);
        expect(confirmsCompanyName('   ', company)).toBe(false);
      }),
    );
  });
});
