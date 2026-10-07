import { createHash } from 'node:crypto';
import {
  assertSafeKey,
  type DownloadOptions,
  type PresignedUpload,
  type StorageAdapter,
  type StorageObjectInfo,
  type UploadOptions,
} from './storage.adapter';

export interface CloudinaryOptions {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  /** Overridable for tests. */
  apiBase?: string;
  fetch?: typeof fetch;
}

/** Cloudinary rejects upload signatures older than one hour. */
const UPLOAD_SIGNATURE_SECONDS = 3600;

/**
 * Cloudinary request signature: non-empty parameters sorted by name, `k=v` joined by `&`, the API
 * secret appended, SHA-1 hex (https://cloudinary.com/documentation/authentication_signatures).
 */
export function cloudinarySignature(params: Record<string, string>, secret: string): string {
  const payload = Object.keys(params)
    .filter((k) => params[k] !== '')
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return createHash('sha1')
    .update(payload + secret)
    .digest('hex');
}

/**
 * Cloudinary driver (M14, owner choice 2026-10-07; no AWS). Every object is an **authenticated raw
 * asset** whose public id is our storage key, so it is never publicly reachable and its bytes are
 * stored unchanged. Browsers upload with a signed multipart POST; downloads are signed, expiring
 * `private_download_url`s; the server reads objects back the same way for verification and scanning.
 */
export class CloudinaryStorageAdapter implements StorageAdapter {
  private readonly api: string;
  private readonly http: typeof fetch;

  constructor(private readonly options: CloudinaryOptions) {
    this.api = `${options.apiBase ?? 'https://api.cloudinary.com'}/v1_1/${options.cloudName}`;
    this.http = options.fetch ?? fetch;
  }

  private signed(params: Record<string, string>): Record<string, string> {
    return {
      ...params,
      api_key: this.options.apiKey,
      signature: cloudinarySignature(params, this.options.apiSecret),
    };
  }

  private now(): number {
    return Math.floor(Date.now() / 1000);
  }

  private uploadParams(key: string): Record<string, string> {
    return { public_id: key, type: 'authenticated', overwrite: 'false', timestamp: String(this.now()) };
  }

  private async call(path: string, form: FormData): Promise<Record<string, unknown>> {
    const res = await this.http(`${this.api}${path}`, { method: 'POST', body: form });
    if (!res.ok) throw new Error(`Cloudinary ${path} answered ${res.status}`);
    return (await res.json()) as Record<string, unknown>;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    assertSafeKey(key);
    const form = new FormData();
    for (const [k, v] of Object.entries(this.signed({ ...this.uploadParams(key), overwrite: 'true' })))
      form.append(k, v);
    form.append('file', new Blob([new Uint8Array(body)], { type: contentType }));
    await this.call('/raw/upload', form);
  }

  private downloadUrl(key: string, expiresInSeconds: number, attachment: boolean): string {
    const params = this.signed({
      public_id: key,
      type: 'authenticated',
      timestamp: String(this.now()),
      expires_at: String(this.now() + expiresInSeconds),
      ...(attachment ? { attachment: 'true' } : {}),
    });
    return `${this.api}/raw/download?${new URLSearchParams(params).toString()}`;
  }

  async get(key: string): Promise<Buffer> {
    assertSafeKey(key);
    const res = await this.http(this.downloadUrl(key, 60, false));
    if (!res.ok) throw new Error(`Cloudinary download answered ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  /** Cloudinary's download API has no ranges: reads the object (≤ 50 MB by M14 rules) and slices it. */
  async readRange(key: string, offset: number, length: number): Promise<Buffer> {
    return (await this.get(key)).subarray(offset, offset + length);
  }

  async head(key: string): Promise<StorageObjectInfo | null> {
    assertSafeKey(key);
    const auth = Buffer.from(`${this.options.apiKey}:${this.options.apiSecret}`).toString('base64');
    const res = await this.http(`${this.api}/resources/raw/authenticated/${key}`, {
      headers: { authorization: `Basic ${auth}` },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Cloudinary resource lookup answered ${res.status}`);
    const body = (await res.json()) as { bytes?: unknown };
    return { key, size: typeof body.bytes === 'number' ? body.bytes : -1 };
  }

  async delete(key: string): Promise<void> {
    assertSafeKey(key);
    const form = new FormData();
    const params = {
      public_id: key,
      type: 'authenticated',
      invalidate: 'true',
      timestamp: String(this.now()),
    };
    for (const [k, v] of Object.entries(this.signed(params))) form.append(k, v);
    const result = (await this.call('/raw/destroy', form)).result;
    if (result !== 'ok' && result !== 'not found') throw new Error(`Cloudinary destroy: ${String(result)}`);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async presignUpload(key: string, _options: UploadOptions): Promise<PresignedUpload> {
    assertSafeKey(key);
    // Size and type cannot be bound into the signature; both are verified on complete (M14 §7).
    const params = this.uploadParams(key);
    return {
      url: `${this.api}/raw/upload`,
      method: 'POST',
      headers: {},
      fields: this.signed(params),
      expiresAt: new Date((Number(params.timestamp) + UPLOAD_SIGNATURE_SECONDS) * 1000),
    };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async presignDownload(key: string, options: DownloadOptions = {}): Promise<string> {
    assertSafeKey(key);
    const attachment = !options.contentDisposition?.startsWith('inline');
    return this.downloadUrl(key, options.expiresInSeconds ?? 300, attachment);
  }
}
