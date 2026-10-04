import {
  canRestore,
  confirmsCompanyName,
  isPartnerWorkspace,
  parseLimits,
  purgeBefore,
  restoreDeadline,
  withinLimit,
} from './limits';

describe('M02 limits & soft delete', () => {
  it('parses stored limits, dropping unknown keys and invalid values', () => {
    expect(
      parseLimits({ companies: 2, users: -1, projectsPerYear: 1.5, extra: 3, clientWorkspaces: 0 }),
    ).toEqual({
      companies: 2,
      clientWorkspaces: 0,
    });
    expect(parseLimits(null)).toEqual({});
    expect(parseLimits('x')).toEqual({});
  });

  it.each([
    [undefined, 99, 1, true],
    [null, 99, 1, true],
    [1, 0, 1, true],
    [1, 1, 1, false],
    [5, 3, 2, true],
    [5, 3, 3, false],
    [0, 0, 1, false],
  ])('withinLimit(max=%s, used=%s, adding=%s) = %s', (max, used, adding, ok) => {
    expect(withinLimit(max, used, adding)).toBe(ok);
  });

  it('treats a workspace as a partner only with a positive client-workspace limit', () => {
    expect(isPartnerWorkspace({ clientWorkspaces: 3 })).toBe(true);
    expect(isPartnerWorkspace({ clientWorkspaces: 0 })).toBe(false);
    expect(isPartnerWorkspace({})).toBe(false);
  });

  it('allows restore for exactly 30 days', () => {
    const deleted = new Date('2026-01-01T00:00:00Z');
    expect(restoreDeadline(deleted).toISOString()).toBe('2026-01-31T00:00:00.000Z');
    expect(canRestore(deleted, new Date('2026-01-30T23:59:59Z'))).toBe(true);
    expect(canRestore(deleted, new Date('2026-01-31T00:00:00Z'))).toBe(false);
    expect(canRestore(null, new Date())).toBe(false);
    expect(purgeBefore(new Date('2026-01-31T00:00:00Z')).toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('confirms deletion by display or legal name, ignoring case and spacing', () => {
    const c = { displayName: 'Acme', legalName: 'Acme  Industries Ltd' };
    expect(confirmsCompanyName('acme', c)).toBe(true);
    expect(confirmsCompanyName(' ACME industries ltd ', c)).toBe(true);
    expect(confirmsCompanyName('Acm', c)).toBe(false);
    expect(confirmsCompanyName('', c)).toBe(false);
    expect(confirmsCompanyName(undefined, c)).toBe(false);
  });
});
