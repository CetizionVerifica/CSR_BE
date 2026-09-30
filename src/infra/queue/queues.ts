import { BullModule } from '@nestjs/bullmq';
import { type DynamicModule } from '@nestjs/common';
import { AppConfig } from '../../config/app-config';

/** Queue names (ADR-007). Side effects never run in the request path. */
export const QUEUES = {
  email: 'email',
  reportRender: 'report-render',
  import: 'import',
  survey: 'survey',
  ai: 'ai',
  scheduled: 'scheduled',
  retention: 'retention',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export interface EmailJob {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  stream?: string;
}

export const bullRoot = (): DynamicModule =>
  BullModule.forRootAsync({
    inject: [AppConfig],
    useFactory: (config: AppConfig) => ({
      // BullMQ 6 accepts the URL directly; workers need maxRetriesPerRequest: null.
      connection: { url: config.get('REDIS_URL'), maxRetriesPerRequest: null },
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { age: 7 * 24 * 3600, count: 10_000 },
        removeOnFail: { age: 30 * 24 * 3600 },
      },
    }),
  });

export const registerQueues = (...names: QueueName[]): DynamicModule =>
  BullModule.registerQueue(...names.map((name) => ({ name })));
