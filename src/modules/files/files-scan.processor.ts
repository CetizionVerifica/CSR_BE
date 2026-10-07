import { Processor, WorkerHost } from '@nestjs/bullmq';
import { type Job } from 'bullmq';
import { QUEUES } from '../../infra/queue/queues';
import { FileScanService, type ScanOutcome } from './file-scan.service';
import { type FileScanJob } from './files.service';

/** Worker of the `files` queue: hash + malware scan of completed uploads (M14 §2). */
@Processor(QUEUES.files)
export class FilesScanProcessor extends WorkerHost {
  constructor(private readonly scans: FileScanService) {
    super();
  }

  process(job: Job<FileScanJob>): Promise<ScanOutcome> {
    return this.scans.scan(job.data.workspaceId, job.data.versionId);
  }
}
