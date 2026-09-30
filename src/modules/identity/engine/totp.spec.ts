import { base32Decode, base32Encode, hotp, otpauthUri, totp, verifyTotp } from './totp';

// RFC 6238 Appendix B (SHA-1 seed), truncated to 6 digits; RFC 4226 Appendix D for HOTP.
const SEED = Buffer.from('12345678901234567890', 'ascii');

describe('TOTP (RFC 6238)', () => {
  it.each([
    [0, '755224'],
    [1, '287082'],
    [9, '520489'],
  ])('HOTP counter %i = %s', (counter, code) => {
    expect(hotp(SEED, counter)).toBe(code);
  });

  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ])('TOTP at %i s = %s', (sec, code) => {
    expect(totp(SEED, sec * 1000)).toBe(code);
  });

  it('accepts ±1 step and returns the matched step', () => {
    const t = 1234567890 * 1000;
    expect(verifyTotp(SEED, totp(SEED, t - 30_000), t)).toBe(Math.floor(t / 30_000) - 1);
    expect(verifyTotp(SEED, totp(SEED, t + 30_000), t)).toBe(Math.floor(t / 30_000) + 1);
    expect(verifyTotp(SEED, totp(SEED, t - 60_000), t)).toBeNull();
  });

  it.each(['', '12345', '1234567', 'abcdef', ' 12345'])('rejects malformed code %j', (code) => {
    expect(verifyTotp(SEED, code, 0)).toBeNull();
  });

  it('base32 round-trips (RFC 4648 vectors)', () => {
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
    expect(base32Decode('MZXW6YTBOI').toString()).toBe('foobar');
    expect(base32Decode('mzxw6ytboi======').toString()).toBe('foobar');
    expect(() => base32Decode('1')).toThrow();
  });

  it('builds an otpauth URI', () => {
    expect(otpauthUri('MZXW6YTBOI', 'jane@example.com')).toBe(
      'otpauth://totp/ResiliSense%3Ajane%40example.com?secret=MZXW6YTBOI&issuer=ResiliSense&algorithm=SHA1&digits=6&period=30',
    );
  });
});
