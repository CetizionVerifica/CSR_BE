import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Queue } from 'bullmq';
import { type Permission } from '../../common/auth/decorators';
import { type AuthenticatedPrincipal } from '../../common/auth/principal';
import { ProblemError } from '../../common/errors/problem';
import { type RequestMeta } from '../../common/http/request-meta';
import { uuidv7 } from '../../common/ids';
import { toPage } from '../../common/pagination';
import { type File, type FileVersion } from '../../generated/prisma/client';
import { QUEUES } from '../../infra/queue/queues';
import { STORAGE_ADAPTER, type StorageAdapter } from '../../infra/storage/storage.adapter';
import { type AuditActor, AuditService } from '../audit/audit.service';
import { decidePermission } from '../identity/engine/permissions';
import { actorOf, currentWorkspace, invalid, limitExceeded, notFound } from '../workspaces/access';
import { parseLimits } from '../workspaces/engine/limits';
import { type CreateUploadInput, type CreateVersionInput } from './dto/files.dto';
import {
  checkDeclared,
  contentDisposition,
  contentMatches,
  HEAD_BYTES,
  isPreviewable,
  kindOfMime,
  mimeTypeOf,
  needsTail,
  safeFileName,
  storageKey,
  svgProblem,
  TAIL_BYTES,
  type UploadPurpose,
  UPLOAD_PURPOSES,
  URL_TTL_SECONDS,
  withinStorageQuota,
} from './engine/file-rules';
import { FileEvents } from './events';
import { FilesRepository, type FileWithVersions } from './files.repository';

export const FILE_SCAN_JOB = 'files.scan';
export interface FileScanJob {
  workspaceId: string;
  versionId: string;
}

const SCAN_RESULTS = ['clean', 'infected', 'skipped'] as const;
type ScanResultName = (typeof SCAN_RESULTS)[number];

const scanResultOf = (json: unknown): ScanResultName | null => {
  const status = (json as { status?: unknown } | null)?.status;
  return SCAN_RESULTS.find((s) => s === status) ?? null;
};

const toVersion = (v: FileVersion) => ({
  id: v.id,
  name: v.name,
  mimeType: v.mimeType,
  sizeBytes: Number(v.sizeBytes),
  sha256: v.sha256,
  status: v.status,
  scanResult: scanResultOf(v.scanResult),
  uploadedBy: v.uploadedBy,
  createdAt: v.createdAt.toISOString(),
});

export const toFile = (f: File, current: FileVersion | null = null) => ({
  id: f.id,
  purpose: f.purpose,
  name: f.name,
  mimeType: f.mimeType,
  sizeBytes: Number(f.sizeBytes),
  status: f.status,
  currentVersionId: f.currentVersionId,
  sha256: current?.sha256 ?? null,
  uploadedBy: f.uploadedBy,
  createdAt: f.createdAt.toISOString(),
  updatedAt: f.updatedAt.toISOString(),
  deletedAt: f.deletedAt?.toISOString() ?? null,
});

const toDetail = (f: FileWithVersions) => ({
  ...toFile(f, f.versions.find((v) => v.id === f.currentVersionId) ?? null),
  versions: f.versions.map(toVersion),
});

/** Who may upload, replace and delete files of a purpose (M14 §4); reading needs project:read. */
const PURPOSE_PERMISSION: Record<File['purpose'], Permission> = {
  evidence: 'evidence:upload',
  attachment: 'evidence:upload',
  logo: 'company:update',
  import: 'company:update',
  report: 'report:export',
  avatar: 'company:update',
};

const isUploadPurpose = (p: string): p is UploadPurpose => (UPLOAD_PURPOSES as readonly string[]).includes(p);

/**
 * Upload, verification, download, versions and deletion of files (M14 §2, §4). Objects go straight
 * from the browser to the store through presigned URLs; this service checks what arrived.
 */
@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly files: FilesRepository,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
    @InjectQueue(QUEUES.files) private readonly queue: Queue<FileScanJob>,
    private readonly audit: AuditService,
  ) {}

  /** The route's base permission is project:read; the purpose decides the write permission. */
  private require(p: AuthenticatedPrincipal, purpose: File['purpose']): void {
    const permission = PURPOSE_PERMISSION[purpose];
    const decision = decidePermission(permission, p.permissions, p.modules, !!p.workspaceId);
    if (decision.allowed) return;
    if (decision.reason === 'entitlement_required')
      throw new ProblemError(
        'entitlement_required',
        'Module not included in your plan',
        `Requires module ${decision.module}`,
        {
          module: decision.module,
        },
      );
    throw new ProblemError('forbidden', 'Not allowed', `Requires permission ${permission}`);
  }

  private async mustFind(p: AuthenticatedPrincipal, id: string): Promise<FileWithVersions> {
    const file = await this.files.find(currentWorkspace(p), id);
    if (!file || file.deletedAt) throw notFound();
    return file;
  }

  private async checkQuota(wid: string, adding: number): Promise<void> {
    const limit = parseLimits(await this.files.limits(wid)).storageMb;
    if (!withinStorageQuota(limit, await this.files.storedBytes(wid), adding))
      throw limitExceeded('storageMb', limit ?? 0, 'Storage limit reached');
  }

  private declared(purpose: UploadPurpose, input: CreateVersionInput) {
    const check = checkDeclared(purpose, input);
    if (!check.ok) throw invalid(check.path, check.message);
    return { name: safeFileName(input.name), mimeType: mimeTypeOf(check.kind), size: input.size };
  }

  private async presign(key: string, mimeType: string, size: number) {
    const up = await this.storage.presignUpload(key, {
      contentType: mimeType,
      contentLength: size,
      expiresInSeconds: URL_TTL_SECONDS,
    });
    return {
      url: up.url,
      method: up.method,
      headers: up.headers,
      fields: up.fields,
      expiresAt: up.expiresAt.toISOString(),
    };
  }

  async list(
    p: AuthenticatedPrincipal,
    q: {
      purpose?: UploadPurpose | undefined;
      status?: File['status'] | undefined;
      cursor?: string | undefined;
      limit: number;
    },
  ) {
    const rows = await this.files.list(currentWorkspace(p), q, q.cursor, q.limit + 1);
    const pageRows = toPage(rows, q.limit);
    return { items: pageRows.items.map((f) => toFile(f)), nextCursor: pageRows.nextCursor };
  }

  async get(p: AuthenticatedPrincipal, id: string) {
    return toDetail(await this.mustFind(p, id));
  }

  /** `POST /files/uploads`: a pending file + version and a presigned PUT URL (5 min). */
  async createUpload(p: AuthenticatedPrincipal, input: CreateUploadInput, meta: RequestMeta) {
    const wid = currentWorkspace(p);
    this.require(p, input.purpose);
    const d = this.declared(input.purpose, input);
    await this.checkQuota(wid, d.size);
    const fileId = uuidv7();
    const versionId = uuidv7();
    const key = storageKey(wid, input.purpose, fileId, versionId);
    const common = { name: d.name, mimeType: d.mimeType, sizeBytes: BigInt(d.size), uploadedBy: p.userId };
    const created = await this.files.create(
      wid,
      { id: fileId, purpose: input.purpose, ...common },
      { id: versionId, s3Key: key, ...common },
    );
    await this.audit.record(
      {
        action: FileEvents.uploadStarted,
        entityType: 'file',
        entityId: fileId,
        workspaceId: wid,
        actor: actorOf(p),
        diff: { purpose: input.purpose, mimeType: d.mimeType, sizeBytes: d.size },
      },
      meta,
    );
    return { file: toFile(created), versionId, upload: await this.presign(key, d.mimeType, d.size) };
  }

  /** `POST /files/:id/versions`: replaces the file's content; history is kept (M14 §2 Versioning). */
  async createVersion(p: AuthenticatedPrincipal, id: string, input: CreateVersionInput, meta: RequestMeta) {
    const file = await this.mustFind(p, id);
    this.require(p, file.purpose);
    if (!isUploadPurpose(file.purpose))
      throw new ProblemError('conflict', 'This file cannot get new versions');
    if (file.versions.some((v) => v.status === 'scanning'))
      throw new ProblemError('conflict', 'A version is still being checked', 'Try again in a moment');
    const d = this.declared(file.purpose, input);
    await this.checkQuota(file.workspaceId, d.size);
    for (const stale of file.versions.filter((v) => v.status === 'pending')) await this.reject(file, stale);
    const versionId = uuidv7();
    const key = storageKey(file.workspaceId, file.purpose, file.id, versionId);
    await this.files.addVersion(file.workspaceId, file.id, {
      id: versionId,
      s3Key: key,
      name: d.name,
      mimeType: d.mimeType,
      sizeBytes: BigInt(d.size),
      uploadedBy: p.userId,
    });
    await this.audit.record(
      {
        action: FileEvents.versionAdded,
        entityType: 'file',
        entityId: file.id,
        workspaceId: file.workspaceId,
        actor: actorOf(p),
        diff: { versionId, mimeType: d.mimeType, sizeBytes: d.size },
      },
      meta,
    );
    const fresh = (await this.files.find(file.workspaceId, file.id))!;
    return { file: toFile(fresh), versionId, upload: await this.presign(key, d.mimeType, d.size) };
  }

  /** Marks a pending version rejected and drops its object; a file without any ready version goes too. */
  private async reject(
    file: File,
    version: FileVersion,
    reason?: string,
    meta: RequestMeta | null = null,
  ): Promise<void> {
    await this.storage
      .delete(version.s3Key)
      .catch((e: unknown) => this.logger.warn({ err: e }, 'object delete failed'));
    const noContent = !file.currentVersionId;
    await this.files.transitionVersion(
      file.workspaceId,
      version.id,
      version.status,
      { status: 'rejected' },
      noContent ? { status: 'deleted', deletedAt: new Date() } : undefined,
    );
    if (reason)
      await this.audit.record(
        {
          action: FileEvents.rejected,
          entityType: 'file',
          entityId: file.id,
          workspaceId: file.workspaceId,
          actor: { type: 'system' },
          diff: { versionId: version.id, reason },
        },
        meta,
      );
  }

  /**
   * `POST /files/:id/complete`: verifies the uploaded object (size, magic bytes, SVG safety) and
   * queues the malware scan. Rejected uploads are deleted and answer 400.
   */
  async complete(p: AuthenticatedPrincipal, id: string, meta: RequestMeta) {
    const file = await this.mustFind(p, id);
    this.require(p, file.purpose);
    const version = file.versions.find((v) => v.status === 'pending');
    if (!version)
      throw new ProblemError('conflict', 'Nothing to complete', 'No upload is waiting for this file');
    const head = await this.storage.head(version.s3Key);
    if (!head)
      throw new ProblemError(
        'conflict',
        'The file has not been uploaded yet',
        'PUT the file to the upload URL first',
      );

    const fail = async (reason: string, message: string): Promise<never> => {
      await this.reject(file, version, reason, meta);
      throw invalid('file', message);
    };
    if (head.size !== Number(version.sizeBytes))
      return fail('size_mismatch', 'The uploaded file differs from the declared size');
    const kind = kindOfMime(version.mimeType)!;
    const start = await this.storage.readRange(version.s3Key, 0, HEAD_BYTES);
    const tail = needsTail(start)
      ? await this.storage.readRange(version.s3Key, Math.max(0, head.size - TAIL_BYTES), TAIL_BYTES)
      : undefined;
    if (!contentMatches(kind, start, tail))
      return fail('type_mismatch', 'The file content does not match its type');
    if (kind === 'svg') {
      const problem = svgProblem((await this.storage.get(version.s3Key)).toString('utf8'));
      if (problem) return fail('unsafe_svg', `This SVG is not allowed (${problem})`);
    }

    const moved = await this.files.transitionVersion(
      file.workspaceId,
      version.id,
      'pending',
      { status: 'scanning', mimeDetected: version.mimeType },
      file.status === 'pending' ? { status: 'scanning' } : undefined,
    );
    if (moved)
      await this.queue.add(
        FILE_SCAN_JOB,
        { workspaceId: file.workspaceId, versionId: version.id },
        { jobId: `scan-${version.id}` },
      );
    return toDetail((await this.files.find(file.workspaceId, file.id))!);
  }

  /** `GET /files/:id/download`: a 5-minute link; evidence downloads are audited (M14 §4). */
  async download(p: AuthenticatedPrincipal, id: string, versionId: string | undefined, meta: RequestMeta) {
    const file = await this.mustFind(p, id);
    const version = file.versions.find((v) => v.id === (versionId ?? file.currentVersionId));
    if (!version || version.status !== 'ready') {
      if (versionId && !version) throw notFound();
      throw new ProblemError(
        'conflict',
        'The file is not available',
        'It is still being checked or failed the check',
      );
    }
    const inline = isPreviewable(version.mimeType);
    const url = await this.storage.presignDownload(version.s3Key, {
      expiresInSeconds: URL_TTL_SECONDS,
      contentType: version.mimeType,
      contentDisposition: contentDisposition(version.name, inline),
    });
    if (file.purpose === 'evidence')
      await this.audit.record(
        {
          action: FileEvents.downloaded,
          entityType: 'file',
          entityId: file.id,
          workspaceId: file.workspaceId,
          actor: actorOf(p),
          diff: { versionId: version.id },
        },
        meta,
      );
    return {
      url,
      expiresAt: new Date(Date.now() + URL_TTL_SECONDS * 1000).toISOString(),
      name: version.name,
      mimeType: version.mimeType,
      inline,
    };
  }

  /** `DELETE /files/:id`: soft delete; purged after 30 days. A logo in use must be replaced first. */
  async remove(p: AuthenticatedPrincipal, id: string, meta: RequestMeta): Promise<void> {
    const file = await this.mustFind(p, id);
    this.require(p, file.purpose);
    if (await this.files.usedAsLogo(file.workspaceId, file.id))
      throw new ProblemError('conflict', 'This file is in use as a logo', 'Remove or replace the logo first');
    await this.files.softDelete(file.workspaceId, file.id, new Date());
    await this.audit.record(
      {
        action: FileEvents.deleted,
        entityType: 'file',
        entityId: file.id,
        workspaceId: file.workspaceId,
        actor: actorOf(p),
      },
      meta,
    );
  }

  // ─── Logos (M02 §4.1 branding; deferred to M14) ────────────────────────────

  /** A workspace or company logo must be a ready logo file of the same workspace. */
  async assertLogo(workspaceId: string, fileId: string): Promise<void> {
    const file = await this.files.find(workspaceId, fileId);
    if (!file || file.deletedAt || file.purpose !== 'logo' || file.status !== 'ready')
      throw invalid('logoFileId', 'Choose an uploaded logo image');
  }

  /** After a logo is replaced or removed, the old file is deleted unless something else still uses it. */
  async retireLogo(
    workspaceId: string,
    fileId: string | null,
    actor: AuditActor,
    meta: RequestMeta,
  ): Promise<void> {
    if (!fileId) return;
    const file = await this.files.find(workspaceId, fileId);
    if (!file || file.deletedAt || (await this.files.usedAsLogo(workspaceId, fileId))) return;
    await this.files.softDelete(workspaceId, fileId, new Date());
    await this.audit.record(
      {
        action: FileEvents.deleted,
        entityType: 'file',
        entityId: fileId,
        workspaceId,
        actor,
        diff: { reason: 'logo_replaced' },
      },
      meta,
    );
  }

  /** Megabytes stored by the workspace (entitlements usage). */
  storedBytes(workspaceId: string): Promise<number> {
    return this.files.storedBytes(workspaceId);
  }
}
