/**
 * File rules of M14 §2 and §7: allowed types and sizes per purpose, magic-byte detection, SVG
 * safety, storage keys, quota and download disposition. Pure functions, no I/O.
 */

export const MB = 1024 * 1024;

/** Purposes a client may upload through `POST /files/uploads` (others are written by their modules). */
export const UPLOAD_PURPOSES = ['evidence', 'logo'] as const;
export type UploadPurpose = (typeof UPLOAD_PURPOSES)[number];

export const FILE_KINDS = ['pdf', 'docx', 'xlsx', 'pptx', 'png', 'jpg', 'txt', 'csv', 'svg'] as const;
export type FileKind = (typeof FILE_KINDS)[number];

interface KindInfo {
  mimeTypes: readonly string[];
  extensions: readonly string[];
}

const KINDS: Record<FileKind, KindInfo> = {
  pdf: { mimeTypes: ['application/pdf'], extensions: ['pdf'] },
  docx: {
    mimeTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    extensions: ['docx'],
  },
  xlsx: {
    mimeTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    extensions: ['xlsx'],
  },
  pptx: {
    mimeTypes: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    extensions: ['pptx'],
  },
  png: { mimeTypes: ['image/png'], extensions: ['png'] },
  jpg: { mimeTypes: ['image/jpeg'], extensions: ['jpg', 'jpeg'] },
  txt: { mimeTypes: ['text/plain'], extensions: ['txt'] },
  csv: { mimeTypes: ['text/csv'], extensions: ['csv'] },
  svg: { mimeTypes: ['image/svg+xml'], extensions: ['svg'] },
};

export interface PurposeRule {
  maxBytes: number;
  kinds: readonly FileKind[];
}

/** M14 §2 "Allowed types by purpose". */
export const PURPOSE_RULES: Record<UploadPurpose, PurposeRule> = {
  evidence: { maxBytes: 50 * MB, kinds: ['pdf', 'docx', 'xlsx', 'pptx', 'png', 'jpg', 'txt', 'csv'] },
  logo: { maxBytes: 2 * MB, kinds: ['png', 'svg', 'jpg'] },
};

/** The MIME type stored for a kind (the first listed). */
export const mimeTypeOf = (kind: FileKind): string => KINDS[kind].mimeTypes[0]!;

/** The kind whose canonical MIME type this is (stored versions carry the canonical type). */
export function kindOfMime(mimeType: string): FileKind | null {
  return FILE_KINDS.find((k) => KINDS[k].mimeTypes.includes(mimeType.toLowerCase())) ?? null;
}

/** ZIP containers (Office documents) are recognised from their central directory, at the end. */
export const needsTail = (head: Uint8Array): boolean => startsWith(head, ZIP);
export const HEAD_BYTES = 64 * 1024;
export const TAIL_BYTES = 256 * 1024;

/** Lower-case extension of a file name, without the dot ('' when there is none). */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export type DeclaredCheck =
  { ok: true; kind: FileKind } | { ok: false; path: 'mimeType' | 'name' | 'size'; message: string };

/** Checks the client's declaration (name, MIME type, size) against the purpose's rule. */
export function checkDeclared(
  purpose: UploadPurpose,
  input: { name: string; mimeType: string; size: number },
): DeclaredCheck {
  const rule = PURPOSE_RULES[purpose];
  const mime = input.mimeType.toLowerCase();
  const kind = rule.kinds.find((k) => KINDS[k].mimeTypes.includes(mime));
  if (!kind)
    return { ok: false, path: 'mimeType', message: `This type of file is not allowed for ${purpose}` };
  if (!KINDS[kind].extensions.includes(extensionOf(input.name)))
    return { ok: false, path: 'name', message: 'The file extension does not match its type' };
  if (input.size > rule.maxBytes)
    return { ok: false, path: 'size', message: `The file is larger than ${rule.maxBytes / MB} MB` };
  return { ok: true, kind };
}

/** A safe display/download name: no path, no control characters, at most 255 characters. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return clean.slice(0, 255) || 'file';
}

// ─── Magic bytes (M14 §2: "magic-byte type check") ────────────────────────────

const startsWith = (buf: Uint8Array, sig: readonly number[], offset = 0): boolean =>
  buf.length >= offset + sig.length && sig.every((b, i) => buf[offset + i] === b);

const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPG = [0xff, 0xd8, 0xff];
const ZIP = [0x50, 0x4b, 0x03, 0x04]; // PK\3\4

/** UTF-8 text without NUL or other control characters (tab, CR, LF and form feed allowed). */
export function isPlainText(buf: Uint8Array): boolean {
  let text: string;
  try {
    // stream: true tolerates a multi-byte character cut at the end of a partial read.
    text = new TextDecoder('utf-8', { fatal: true }).decode(buf, { stream: true });
  } catch {
    return false;
  }
  // eslint-disable-next-line no-control-regex
  return !/[\u0000-\u0008\u000b\u000e-\u001f\u007f]/.test(text);
}

const latin1 = (buf: Uint8Array): string => Buffer.from(buf).toString('latin1');

/** The Office Open XML kind of a ZIP, from the part names in its entries (head + central directory). */
export function officeKind(zipBytes: Uint8Array): 'docx' | 'xlsx' | 'pptx' | null {
  const names = latin1(zipBytes);
  if (!names.includes('[Content_Types].xml')) return null;
  if (names.includes('word/')) return 'docx';
  if (names.includes('xl/')) return 'xlsx';
  if (names.includes('ppt/')) return 'pptx';
  return null;
}

/**
 * Detects the kind of a file from its first bytes (`head`) and, for ZIP containers, its last bytes
 * (`tail`, which holds the central directory). Returns the possible kinds: text matches txt, csv
 * and (when it is an SVG document) svg.
 */
export function detectKinds(head: Uint8Array, tail: Uint8Array = new Uint8Array()): FileKind[] {
  if (startsWith(head, PDF)) return ['pdf'];
  if (startsWith(head, PNG)) return ['png'];
  if (startsWith(head, JPG)) return ['jpg'];
  if (startsWith(head, ZIP)) {
    const kind = officeKind(Buffer.concat([head, tail]));
    return kind ? [kind] : [];
  }
  if (head.length > 0 && isPlainText(head))
    return isSvgDocument(head) ? ['txt', 'csv', 'svg'] : ['txt', 'csv'];
  return [];
}

/** True when the detected content is what the client declared. */
export function contentMatches(declared: FileKind, head: Uint8Array, tail?: Uint8Array): boolean {
  return detectKinds(head, tail).includes(declared);
}

// ─── SVG (M14 §2: logos may be SVG, sanitised) ────────────────────────────────

/** Text whose first element is `<svg` (after an optional BOM, XML declaration, comments, doctype). */
export function isSvgDocument(buf: Uint8Array): boolean {
  const text = Buffer.from(buf)
    .toString('utf8')
    .replace(/^\uFEFF/, '');
  const prolog = /^(\s*(<\?xml[^>]*\?>|<!--[\s\S]*?-->|<!DOCTYPE svg[^>[]*>))*\s*<svg[\s>]/i;
  return prolog.test(text);
}

const SVG_FORBIDDEN: ReadonlyArray<[RegExp, string]> = [
  [/<script[\s>/]/i, 'script element'],
  [/<foreignObject[\s>/]/i, 'foreignObject element'],
  [/<(iframe|embed|object|audio|video)[\s>/]/i, 'embedded content'],
  [/<!ENTITY/i, 'entity declaration'],
  [/\son[a-z]+\s*=/i, 'event handler attribute'],
  [/javascript:/i, 'javascript: URL'],
  [/@import/i, 'CSS import'],
  [/(?:href|src)\s*=\s*["']?\s*(?!#|data:image\/(?:png|jpeg);)[^"'\s>]/i, 'external reference'],
  [/url\(\s*["']?\s*(?!#)/i, 'external CSS url()'],
];

/**
 * Logos may be SVG only when they cannot run script or load anything: the first forbidden
 * construct found, or null when the document is safe. Rejecting is the "sanitisation" (M14 §7).
 */
export function svgProblem(svg: string): string | null {
  for (const [pattern, label] of SVG_FORBIDDEN) if (pattern.test(svg)) return label;
  return null;
}

// ─── Storage keys, quota, retention, download ─────────────────────────────────

/** `<workspaceId>/<purpose>/<fileId>/<versionId>`: server ids only, never user input (M14 §2). */
export const storageKey = (workspaceId: string, purpose: string, fileId: string, versionId: string): string =>
  `${workspaceId}/${purpose}/${fileId}/${versionId}`;

/** Quarantined objects are moved under a separate prefix that is never served. */
export const quarantineKey = (key: string): string => `quarantine/${key}`;

/** True when storing `adding` more bytes keeps the workspace within `limitMb` (null = unlimited). */
export function withinStorageQuota(
  limitMb: number | null | undefined,
  usedBytes: number,
  adding: number,
): boolean {
  return limitMb === null || limitMb === undefined || usedBytes + adding <= limitMb * MB;
}

/** Whole megabytes used, rounded up (shown next to the plan's storage limit). */
export const usedMegabytes = (bytes: number): number => Math.ceil(bytes / MB);

/** Deleted files are purged 30 days after deletion; unfinished uploads after 24 hours (M14 §7). */
export const FILE_RETENTION_DAYS = 30;
export const PENDING_UPLOAD_HOURS = 24;
const HOUR_MS = 3600_000;

export const purgeDeletedBefore = (now: Date): Date =>
  new Date(now.getTime() - FILE_RETENTION_DAYS * 24 * HOUR_MS);
export const abandonedUploadBefore = (now: Date): Date =>
  new Date(now.getTime() - PENDING_UPLOAD_HOURS * HOUR_MS);

/** Presigned URLs live 5 minutes (M14 §2). */
export const URL_TTL_SECONDS = 300;

/** PDFs and raster images open in the browser; everything else (incl. SVG) downloads. */
export const isPreviewable = (mimeType: string): boolean =>
  ['application/pdf', 'image/png', 'image/jpeg'].includes(mimeType);

/** RFC 6266 Content-Disposition with an ASCII fallback and the UTF-8 name. */
export function contentDisposition(name: string, inline: boolean): string {
  const ascii = safeFileName(name)
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\]/g, '_');
  const utf8 = encodeURIComponent(safeFileName(name)).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}
