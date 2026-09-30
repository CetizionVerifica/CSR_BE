import { createHmac, randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import {
  assertSafeKey,
  type PresignedUpload,
  type StorageAdapter,
  type StorageObjectInfo,
} from './storage.adapter';

/**
 * Filesystem driver for development and tests. Presigned URLs point at a (future) local
 * upload route and are HMAC-signed so the upload flow can be exercised end to end.
 */
export class LocalStorageAdapter implements StorageAdapter {
  private readonly root: string;
  private readonly secret = randomBytes(32);

  constructor(
    rootDir: string,
    private readonly publicBaseUrl = 'http://localhost:4000/v1/_local-storage',
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

  private sign(payload: string): string {
    return createHmac('sha256', this.secret).update(payload).digest('hex');
  }

  presignUpload(key: string, contentType: string, expiresInSeconds = 300): Promise<PresignedUpload> {
    this.path(key);
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    const exp = Math.floor(expiresAt.getTime() / 1000);
    const sig = this.sign(`PUT\n${key}\n${contentType}\n${exp}`);
    return Promise.resolve({
      url: `${this.publicBaseUrl}/${key}?exp=${exp}&sig=${sig}`,
      method: 'PUT',
      headers: { 'content-type': contentType },
      expiresAt,
    });
  }

  presignDownload(key: string, expiresInSeconds = 300): Promise<string> {
    this.path(key);
    const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
    return Promise.resolve(`${this.publicBaseUrl}/${key}?exp=${exp}&sig=${this.sign(`GET\n${key}\n${exp}`)}`);
  }
}
