import { UUID_RE, uuidFromName, uuidv7 } from './ids';

describe('ids', () => {
  it('uuidv7 is a valid v7 UUID that sorts by creation time', () => {
    const a = uuidv7(1_700_000_000_000);
    const b = uuidv7(1_700_000_000_001);
    expect(a).toMatch(UUID_RE);
    expect(a[14]).toBe('7');
    expect(a < b).toBe(true);
  });

  it('uuidv7 is unique for the same millisecond', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => uuidv7(1_700_000_000_000)));
    expect(ids.size).toBe(1000);
  });

  it('uuidFromName is deterministic v5', () => {
    const a = uuidFromName('taxonomy:ISO26000-v3');
    expect(a).toBe(uuidFromName('taxonomy:ISO26000-v3'));
    expect(a).not.toBe(uuidFromName('taxonomy:ISO26000-v4'));
    expect(a).toMatch(UUID_RE);
    expect(a[14]).toBe('5');
  });
});
