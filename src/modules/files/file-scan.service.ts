import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { type Prisma } from '../../generated/prisma/client';
import { MALWARE_SCANNER, type MalwareScanner } from '../../infra/malware/malware-scanner';
import { STORAGE_ADAPTER, type StorageAdapter } from '../../infra/storage/storage.adapter';
import { AuditService } from '../audit/audit.service';
import { quarantineKey } from './engine/file-rules';
import { FileEvents } from './events';
import { FilesRepository } from './files.repository';

export type ScanOutcome = 'ready' | 'quarantined' | 'skipped';

/**
 * Second half of an upload (M14 §2), run by the worker: SHA-256 and malware scan, then the version
 * becomes the file's current content (`ready`) or is moved to the quarantine prefix, never served.
 */
@Injectable()
export class FileScanService {
  constructor(
    private readonly files: FilesRepository,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
    @Inject(MALWARE_SCANNER) private readonly scanner: MalwareScanner,
    private readonly audit: AuditService,
  ) {}

  async scan(workspaceId: string, versionId: string): Promise<ScanOutcome> {
    const version = await this.files.findVersion(workspaceId, versionId);
    if (!version || version.status !== 'scanning') return 'skipped';
    const { file } = version;
    const content = await this.storage.get(version.s3Key);
    const sha256 = createHash('sha256').update(content).digest('hex');
    // Throws while the scanner is unavailable: the job is retried with backoff.
    const verdict = await this.scanner.scan(content);
    const scanResult = verdict as unknown as Prisma.InputJsonValue;
    const system = { type: 'system' as const };

    if (verdict.status === 'infected') {
      const target = quarantineKey(version.s3Key);
      await this.storage.put(target, content, version.mimeType);
      await this.storage.delete(version.s3Key);
      await this.files.transitionVersion(
        workspaceId,
        versionId,
        'scanning',
        { status: 'quarantined', s3Key: target, sha256, scanResult },
        file.currentVersionId || file.deletedAt ? undefined : { status: 'quarantined' },
      );
      await this.audit.record(
        {
          action: FileEvents.quarantined,
          entityType: 'file',
          entityId: file.id,
          workspaceId,
          actor: system,
          diff: { versionId, signature: verdict.signature },
        },
        null,
      );
      return 'quarantined';
    }

    await this.files.transitionVersion(
      workspaceId,
      versionId,
      'scanning',
      { status: 'ready', sha256, scanResult },
      {
        currentVersionId: versionId,
        name: version.name,
        mimeType: version.mimeType,
        sizeBytes: version.sizeBytes,
        ...(file.deletedAt ? {} : { status: 'ready' }),
      },
    );
    await this.audit.record(
      {
        action: FileEvents.ready,
        entityType: 'file',
        entityId: file.id,
        workspaceId,
        actor: system,
        diff: { versionId, sha256, scan: verdict.status },
      },
      null,
    );
    return 'ready';
  }
}
