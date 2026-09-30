import { createHmac, timingSafeEqual } from 'node:crypto';

/** RFC 4648 base32 (no padding) — the encoding authenticator apps expect. */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error('invalid base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const TOTP = { stepSec: 30, digits: 6, window: 1 } as const;

/** RFC 4226 HOTP (HMAC-SHA-1, dynamic truncation). */
export function hotp(secret: Buffer, counter: number, digits: number = TOTP.digits): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac('sha1', secret).update(msg).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const code = (mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return code.toString().padStart(digits, '0');
}

export const totpStep = (nowMs: number): number => Math.floor(nowMs / 1000 / TOTP.stepSec);

export function totp(secret: Buffer, nowMs: number): string {
  return hotp(secret, totpStep(nowMs));
}

/**
 * RFC 6238 verification with ±window steps. Returns the matched step (so callers can reject
 * reuse of the same step) or null.
 */
export function verifyTotp(
  secret: Buffer,
  code: string,
  nowMs: number,
  window: number = TOTP.window,
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const current = totpStep(nowMs);
  for (let delta = -window; delta <= window; delta++) {
    const step = current + delta;
    if (step < 0) continue;
    const expected = Buffer.from(hotp(secret, step));
    if (timingSafeEqual(expected, Buffer.from(code))) return step;
  }
  return null;
}

export function otpauthUri(secretBase32: string, account: string, issuer = 'ResiliSense'): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
