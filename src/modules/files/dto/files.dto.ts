import { z } from 'zod';
import { paginationQuery, page } from '../../../common/pagination';
import { UPLOAD_PURPOSES } from '../engine/file-rules';

export const FILE_PURPOSES = ['evidence', 'logo', 'import', 'report', 'attachment', 'avatar'] as const;
export const FILE_STATUSES = ['pending', 'scanning', 'ready', 'quarantined', 'deleted'] as const;
export const VERSION_STATUSES = ['pending', 'scanning', 'ready', 'quarantined', 'rejected'] as const;

const declaration = {
  name: z.string().trim().min(1).max(255).describe('Original file name, shown to users'),
  size: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).describe('Size in bytes'),
  mimeType: z.string().trim().min(1).max(255),
};

export const createUploadBody = z.strictObject({
  ...declaration,
  purpose: z.enum(UPLOAD_PURPOSES),
});
export type CreateUploadInput = z.infer<typeof createUploadBody>;

export const createVersionBody = z.strictObject(declaration);
export type CreateVersionInput = z.infer<typeof createVersionBody>;

export const fileVersion = z.object({
  id: z.uuid(),
  name: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
  sha256: z.string().nullable(),
  status: z.enum(VERSION_STATUSES),
  scanResult: z.enum(['clean', 'infected', 'skipped']).nullable(),
  uploadedBy: z.uuid(),
  createdAt: z.string(),
});

export const file = z.object({
  id: z.uuid(),
  purpose: z.enum(FILE_PURPOSES),
  name: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
  status: z.enum(FILE_STATUSES),
  currentVersionId: z.uuid().nullable(),
  sha256: z.string().nullable().describe('SHA-256 of the current version'),
  uploadedBy: z.uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});

export const fileDetail = file.extend({
  versions: z.array(fileVersion).describe('Newest first'),
});

export const presignedUpload = z.object({
  url: z.string().describe('PUT the file body here, with exactly these headers'),
  method: z.literal('PUT'),
  headers: z.record(z.string(), z.string()),
  expiresAt: z.string(),
});

export const uploadResponse = z.object({
  file,
  versionId: z.uuid(),
  upload: presignedUpload,
});

export const listFilesQuery = paginationQuery.extend({
  purpose: z.enum(UPLOAD_PURPOSES).optional(),
  status: z.enum(['pending', 'scanning', 'ready', 'quarantined']).optional(),
});

export const filePage = page(file);

export const downloadQuery = z.object({
  versionId: z.uuid().optional().describe('An older ready version; default the current one'),
});

export const downloadResponse = z.object({
  url: z.string().describe('Short-lived link to the file (5 minutes)'),
  expiresAt: z.string(),
  name: z.string(),
  mimeType: z.string(),
  inline: z.boolean().describe('PDFs and raster images open in the browser; other files download'),
});
