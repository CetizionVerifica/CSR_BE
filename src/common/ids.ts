import { createHash, randomBytes } from 'node:crypto';

function format(bytes: Buffer): string {
  const h = bytes.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** RFC 9562 UUIDv7: 48-bit Unix ms timestamp + random. Time-ordered, index friendly. */
export function uuidv7(nowMs: number = Date.now()): string {
  const bytes = randomBytes(16);
  bytes.writeUIntBE(nowMs, 0, 6);
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  return format(bytes);
}

const NAMESPACE = Buffer.from('6f1c2a8e7b3d4c5e9a0b1c2d3e4f5a6b', 'hex');

/**
 * Deterministic RFC 9562 UUIDv5 for reference data and migrated records,
 * so seeds and ETL re-runs produce the same ids in every environment.
 */
export function uuidFromName(name: string): string {
  const hash = createHash('sha1').update(NAMESPACE).update(name).digest();
  const bytes = hash.subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  return format(Buffer.from(bytes));
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
