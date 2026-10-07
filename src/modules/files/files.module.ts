import { Module } from '@nestjs/common';
import { QUEUES, registerQueues } from '../../infra/queue/queues';
import { FileScanService } from './file-scan.service';
import { FilesPurgeTask } from './files-purge.task';
import { FilesController } from './files.controller';
import { FilesRepository } from './files.repository';
import { FilesService } from './files.service';

/** M14 — Files & evidence (uploads, verification, downloads, versions, deletion, logos). */
@Module({
  imports: [registerQueues(QUEUES.files)],
  controllers: [FilesController],
  // FileScanService and FilesPurgeTask run in the worker; provided here too so tests can drive them.
  providers: [FilesRepository, FilesService, FileScanService, FilesPurgeTask],
  exports: [FilesService],
})
export class FilesModule {}
