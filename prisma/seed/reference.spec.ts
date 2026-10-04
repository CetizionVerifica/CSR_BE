import { COUNTRIES, SECTORS } from './reference';

describe('company reference data (M02 §6)', () => {
  it('has the 249 ISO 3166-1 alpha-2 countries, once each', () => {
    expect(COUNTRIES).toHaveLength(249);
    expect(new Set(COUNTRIES.map((c) => c.code)).size).toBe(249);
    expect(COUNTRIES.every((c) => /^[A-Z]{2}$/.test(c.code))).toBe(true);
  });

  it('has the 4 legacy sector groups and their 43 types with unique codes', () => {
    expect(SECTORS.filter((s) => s.parentCode === null)).toHaveLength(4);
    expect(SECTORS).toHaveLength(47);
    expect(new Set(SECTORS.map((s) => s.code)).size).toBe(47);
    const groups = new Set(SECTORS.filter((s) => !s.parentCode).map((s) => s.code));
    expect(SECTORS.filter((s) => s.parentCode).every((s) => groups.has(s.parentCode!))).toBe(true);
  });
});
