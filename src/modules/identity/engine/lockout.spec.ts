import { isLocked, lockAfterFailure } from './lockout';

const now = new Date('2026-09-30T10:00:00Z');

describe('account lockout', () => {
  it.each([
    [1, null],
    [9, null],
    [10, '2026-09-30T10:15:00.000Z'],
    [25, '2026-09-30T10:15:00.000Z'],
  ])('%i failures → lock %s', (failures, until) => {
    expect(lockAfterFailure(failures, now)?.toISOString() ?? null).toBe(until);
  });

  it.each([
    [null, false],
    [new Date('2026-09-30T10:00:01Z'), true],
    [now, false],
    [new Date('2026-09-30T09:00:00Z'), false],
  ])('locked until %s → %s', (until, locked) => {
    expect(isLocked(until, now)).toBe(locked);
  });
});
