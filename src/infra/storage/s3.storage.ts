import { Client } from 'minio';
import {
  assertSafeKey,
  type DownloadOptions,
  type PresignedUpload,
  type StorageAdapter,
  type StorageObjectInfo,
  type UploadOptions,
} from './storage.adapter';

export interface S3StorageOptions {
  endpoint: string;
  region?: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
}

/**
 * S3-API-compatible driver using the vendor-neutral `minio` client. Works with the VPS
 * provider's object storage, MinIO, Backblaze B2 or Cloudflare R2 — no AWS (ADR-011).
 */
export class S3StorageAdapter implements StorageAdapter {
  private readonly client: Client;
  private readonly bucket: string;

  constructor(options: S3StorageOptions) {
    const url = new URL(options.endpoint);
    this.bucket = options.bucket;
    this.client = new Client({
      endPoint: url.hostname,
      port: url.port ? Number(url.port) : undefined,
      useSSL: url.protocol === 'https:',
      region: options.region,
      accessKey: options.accessKey,
      secretKey: options.secretKey,
    });
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    assertSafeKey(key);
    await this.client.putObject(this.bucket, key, body, body.length, { 'Content-Type': contentType });
  }

  async get(key: string): Promise<Buffer> {
    assertSafeKey(key);
    const stream = await this.client.getObject(this.bucket, key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream)
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
    return Buffer.concat(chunks);
  }

  async readRange(key: string, offset: number, length: number): Promise<Buffer> {
    assertSafeKey(key);
    const stream = await this.client.getPartialObject(this.bucket, key, offset, length);
    const chunks: Buffer[] = [];
    for await (const chunk of stream)
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
    return Buffer.concat(chunks);
  }

  async head(key: string): Promise<StorageObjectInfo | null> {
    assertSafeKey(key);
    try {
      const s = await this.client.statObject(this.bucket, key);
      const contentType = (s.metaData as Record<string, string | undefined>)['content-type'];
      return { key, size: s.size, ...(contentType ? { contentType } : {}) };
    } catch (e) {
      if ((e as { code?: string }).code === 'NotFound' || (e as { code?: string }).code === 'NoSuchKey')
        return null;
      throw e;
    }
  }

  async delete(key: string): Promise<void> {
    assertSafeKey(key);
    await this.client.removeObject(this.bucket, key);
  }

  async presignUpload(key: string, options: UploadOptions): Promise<PresignedUpload> {
    assertSafeKey(key);
    const expiresInSeconds = options.expiresInSeconds ?? 300;
    const url = await this.client.presignedPutObject(this.bucket, key, expiresInSeconds);
    // Size and type are verified server-side after upload (M14 §2): HEAD + magic bytes + ClamAV.
    return {
      url,
      method: 'PUT',
      headers: { 'content-type': options.contentType },
      fields: {},
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
    };
  }

  async presignDownload(key: string, options: DownloadOptions = {}): Promise<string> {
    assertSafeKey(key);
    const params: Record<string, string> = {};
    if (options.contentDisposition) params['response-content-disposition'] = options.contentDisposition;
    if (options.contentType) params['response-content-type'] = options.contentType;
    return this.client.presignedGetObject(this.bucket, key, options.expiresInSeconds ?? 300, params);
  }
}
