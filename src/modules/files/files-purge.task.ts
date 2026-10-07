import { Inject, Injectable, Logger } from '@nestjs/common';
import { type ScheduledTask } from '../../infra/queue/scheduled-jobs';
import { STORAGE_ADAPTER, type StorageAdapter } from '../../infra/storage/storage.adapter';
import { AuditService } from '../audit/audit.service';
import { abandonedUploadBefore, purgeDeletedBefore } from './engine/file-rules';
import { FileEvents } from './events';
import { FilesRepository } from './files.repository';

export const FILES_PURGE_JOB = 'files.purge';

/**
 * Daily, per tenant under RLS (M14 §2 Deletion): uploads never completed within 24 hours are
 * dropped, and files deleted more than 30 days ago are purged — objects first, then the rows. When
 * an object delete fails the row stays as a tombstone and the next run retries it.
 */
@Injectable()
export class FilesPurgeTask implements ScheduledTask {
  readonly name = FILES_PURGE_JOB;
  readonly pattern = '47 3 * * *';
  private readonly logger = new Logger(FilesPurgeTask.name);

  constructor(
    private readonly files: FilesRepository,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
    private readonly audit: AuditService,
  ) {}

  async run(now: Date): Promise<{ abandoned: number; purged: number; failed: number }> {
    let abandoned = 0;
    let purged = 0;
    let failed = 0;
    for (const wid of await this.files.allWorkspaceIds()) {
      for (const v of await this.files.abandonedVersions(wid, abandonedUploadBefore(now))) {
        await this.storage.delete(v.s3Key).catch(() => undefined);
        const noContent = !v.file.currentVersionId && !v.file.deletedAt;
        await this.files.transitionVersion(
          wid,
          v.id,
          'pending',
          { status: 'rejected' },
          noContent ? { status: 'deleted', deletedAt: now } : undefined,
        );
        abandoned++;
      }
      for (const file of await this.files.deletedBefore(wid, purgeDeletedBefore(now))) {
        try {
          for (const v of file.versions) await this.storage.delete(v.s3Key);
        } catch (err) {
          failed++;
          this.logger.warn({ err, fileId: file.id }, 'object delete failed; file kept for the next run');
          continue;
        }
        await this.files.hardDelete(wid, file.id);
        await this.audit.record(
          {
            action: FileEvents.purged,
            entityType: 'file',
            entityId: file.id,
            workspaceId: wid,
            actor: { type: 'system' },
          },
          null,
        );
        purged++;
      }
    }
    return { abandoned, purged, failed };
  }
}
