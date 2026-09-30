import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { type Job, type Queue } from 'bullmq';
import { QUEUES } from '../../infra/queue/queues';
import { SessionsRepository } from './sessions.repository';

export const IDENTITY_CLEANUP_JOB = 'identity.cleanup';

/** Daily deletion of expired tokens, resets and verifications (M01 §6), on the `scheduled` queue. */
@Processor(QUEUES.scheduled)
export class IdentityCleanupProcessor extends WorkerHost {
  private readonly logger = new Logger(IdentityCleanupProcessor.name);

  constructor(private readonly sessions: SessionsRepository) {
    super();
  }

  async process(job: Job): Promise<Record<string, number> | undefined> {
    if (job.name !== IDENTITY_CLEANUP_JOB) return undefined;
    const deleted = await this.sessions.deleteExpired(new Date());
    this.logger.log(`identity cleanup: ${JSON.stringify(deleted)}`);
    return deleted;
  }
}

/** Registers the repeatable job once per deployment (idempotent upsert). */
@Injectable()
export class IdentityCleanupScheduler implements OnApplicationBootstrap {
  constructor(@InjectQueue(QUEUES.scheduled) private readonly queue: Queue) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.upsertJobScheduler(
      IDENTITY_CLEANUP_JOB,
      { pattern: '17 3 * * *', tz: 'UTC' },
      { name: IDENTITY_CLEANUP_JOB },
    );
  }
}
