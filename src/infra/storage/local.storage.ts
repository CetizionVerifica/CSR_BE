import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, open, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import {
  assertSafeKey,
  type DownloadOptions,
  type PresignedUpload,
  type StorageAdapter,
  type StorageObjectInfo,
  type UploadOptions,
} from './storage.adapter';

/** What a signed local URL allows (checked by the local storage route, `local-storage.route.ts`). */
export type LocalGrant =
  | { method: 'PUT'; key: string; contentType: string; contentLength: number }
  | { method: 'GET'; key: string; contentType: string; contentDisposition: string };

/**
 * Filesystem driver for development and tests. Presigned URLs point at the local storage route
 * (mounted only with this driver) and are HMAC-signed, so the upload flow runs end to end.
 */
export class LocalStorageAdapter implements StorageAdapter {
  private readonly root: string;
  private readonly secret = randomBytes(32);

  constructor(
    rootDir: string,
    readonly publicBaseUrl = 'http://localhost:4000/v1/_local-storage',
  ) {
    this.root = resolve(rootDir);
  }

  private path(key: string): string {
    assertSafeKey(key);
    const full = resolve(join(this.root, key));
    if (!full.startsWith(this.root + '/')) throw new Error('Unsafe storage key');
    return full;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    const file = this.path(key);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, body);
    await writeFile(`${file}.meta.json`, JSON.stringify({ contentType }));
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.path(key));
  }

  async readRange(key: string, offset: number, length: number): Promise<Buffer> {
    const handle = await open(this.path(key), 'r');
    try {
      const buf = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buf, 0, length, offset);
      return buf.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  }

  async head(key: string): Promise<StorageObjectInfo | null> {
    const file = this.path(key);
    try {
      const s = await stat(file);
      const meta = JSON.parse(await readFile(`${file}.meta.json`, 'utf8')) as { contentType?: string };
      return { key, size: s.size, ...(meta.contentType ? { contentType: meta.contentType } : {}) };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    const file = this.path(key);
    await rm(file, { force: true });
    await rm(`${file}.meta.json`, { force: true });
  }

  private sign(grant: LocalGrant, exp: number): string {
    return createHmac('sha256', this.secret)
      .update(JSON.stringify([grant, exp]))
      .digest('base64url');
  }

  private url(grant: LocalGrant, expiresInSeconds: number): { url: string; expiresAt: Date } {
    this.path(grant.key);
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    const exp = Math.floor(expiresAt.getTime() / 1000);
    const params = new URLSearchParams({
      exp: String(exp),
      ...(grant.method === 'PUT'
        ? { len: String(grant.contentLength), type: grant.contentType }
        : { type: grant.contentType, disp: grant.contentDisposition }),
      sig: this.sign(grant, exp),
    });
    return { url: `${this.publicBaseUrl}/${grant.key}?${params.toString()}`, expiresAt };
  }

  presignUpload(key: string, options: UploadOptions): Promise<PresignedUpload> {
    const grant: LocalGrant = {
      method: 'PUT',
      key,
      contentType: options.contentType,
      contentLength: options.contentLength,
    };
    const { url, expiresAt } = this.url(grant, options.expiresInSeconds ?? 300);
    return Promise.resolve({
      url,
      method: 'PUT',
      headers: { 'content-type': options.contentType },
      expiresAt,
    });
  }

  presignDownload(key: string, options: DownloadOptions = {}): Promise<string> {
    const grant: LocalGrant = {
      method: 'GET',
      key,
      contentType: options.contentType ?? 'application/octet-stream',
      contentDisposition: options.contentDisposition ?? 'attachment',
    };
    return Promise.resolve(this.url(grant, options.expiresInSeconds ?? 300).url);
  }

  /**
   * The grant a signed URL carries, or null when the signature is wrong, the URL expired or the key
   * is unsafe. `query` is the URL's query string parameters.
   */
  verify(method: string, key: string, query: Record<string, unknown>, now = Date.now()): LocalGrant | null {
    const str = (name: string) => (typeof query[name] === 'string' ? query[name] : undefined);
    const exp = Number(str('exp'));
    const sig = str('sig');
    const type = str('type');
    if (!sig || !type || !Number.isInteger(exp) || exp * 1000 < now) return null;
    try {
      assertSafeKey(key);
    } catch {
      return null;
    }
    let grant: LocalGrant;
    if (method === 'PUT') {
      const len = Number(str('len'));
      if (!Number.isInteger(len) || len < 0) return null;
      grant = { method: 'PUT', key, contentType: type, contentLength: len };
    } else if (method === 'GET') {
      const disp = str('disp');
      if (!disp) return null;
      grant = { method: 'GET', key, contentType: type, contentDisposition: disp };
    } else return null;
    const expected = Buffer.from(this.sign(grant, exp));
    const given = Buffer.from(sig);
    return expected.length === given.length && timingSafeEqual(expected, given) ? grant : null;
  }
}
