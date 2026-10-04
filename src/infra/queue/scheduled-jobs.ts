import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { type Job, type Queue } from 'bullmq';
import { QUEUES } from './queues';

/** A repeatable maintenance job on the `scheduled` queue (cleanups, purges). */
export interface ScheduledTask {
  readonly name: string;
  /** Cron pattern, UTC. */
  readonly pattern: string;
  run(now: Date): Promise<unknown>;
}

export const SCHEDULED_TASKS = Symbol('SCHEDULED_TASKS');

/**
 * The single worker of the `scheduled` queue. One processor per queue: BullMQ hands each job to
 * any worker of the queue, so several processors would complete each other's jobs unrun.
 */
@Processor(QUEUES.scheduled)
export class ScheduledJobsProcessor extends WorkerHost {
  private readonly logger = new Logger(ScheduledJobsProcessor.name);

  constructor(@Inject(SCHEDULED_TASKS) private readonly tasks: ScheduledTask[]) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    const task = this.tasks.find((t) => t.name === job.name);
    if (!task) throw new Error(`No scheduled task named ${job.name}`);
    const result = await task.run(new Date());
    this.logger.log(`${task.name}: ${JSON.stringify(result)}`);
    return result;
  }
}

/** Registers every task's repeatable job once per deployment (idempotent upsert). */
@Injectable()
export class ScheduledJobsScheduler implements OnApplicationBootstrap {
  constructor(
    @InjectQueue(QUEUES.scheduled) private readonly queue: Queue,
    @Inject(SCHEDULED_TASKS) private readonly tasks: ScheduledTask[],
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    for (const t of this.tasks) {
      await this.queue.upsertJobScheduler(t.name, { pattern: t.pattern, tz: 'UTC' }, { name: t.name });
    }
  }
}
