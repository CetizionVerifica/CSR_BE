/**
 * Object storage behind a provider-neutral interface (ADR-010/011, M14).
 * Drivers: `s3` — any S3-API-compatible store (VPS provider object storage, MinIO, B2, R2; never AWS);
 *          `local` — filesystem, for development, tests and Claude Code cloud sessions.
 */
export interface StorageObjectInfo {
  key: string;
  size: number;
  contentType?: string;
}

export interface PresignedUpload {
  url: string;
  method: 'PUT';
  /** Headers the client must send with the PUT. */
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface UploadOptions {
  contentType: string;
  /** Declared size; the local driver refuses any other length, every driver is re-checked on complete. */
  contentLength: number;
  expiresInSeconds?: number;
}

export interface DownloadOptions {
  expiresInSeconds?: number;
  /** Full Content-Disposition header value the store answers with. */
  contentDisposition?: string;
  contentType?: string;
}

export interface StorageAdapter {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  /** Up to `length` bytes from `offset` (fewer at the end of the object). */
  readRange(key: string, offset: number, length: number): Promise<Buffer>;
  head(key: string): Promise<StorageObjectInfo | null>;
  delete(key: string): Promise<void>;
  /** Short-lived URL the browser PUTs the file to directly (default 5 min). */
  presignUpload(key: string, options: UploadOptions): Promise<PresignedUpload>;
  /** Short-lived download URL (default 5 min). */
  presignDownload(key: string, options?: DownloadOptions): Promise<string>;
}

export const STORAGE_ADAPTER = Symbol('STORAGE_ADAPTER');

/** Keys are always server-generated: `<workspaceId>/<purpose>/<fileId>/<versionId>` — never user input. */
export function assertSafeKey(key: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9/_.-]*$/.test(key) || key.includes('..') || key.includes('//')) {
    throw new Error('Unsafe storage key');
  }
}
