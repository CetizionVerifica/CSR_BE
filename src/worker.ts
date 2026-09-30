import 'reflect-metadata';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { type Job } from 'bullmq';
import { Logger } from 'nestjs-pino';
import { AppConfigModule } from './config/config.module';
import { EMAIL_ADAPTER, type EmailAdapter } from './infra/email/email.adapter';
import { EmailModule } from './infra/email/email.module';
import { LoggingModule } from './infra/logging/logging.module';
import { PrismaModule } from './infra/prisma/prisma.module';
import { bullRoot, type EmailJob, QUEUES, registerQueues } from './infra/queue/queues';
import { StorageModule } from './infra/storage/storage.module';
import {
  IdentityCleanupProcessor,
  IdentityCleanupScheduler,
} from './modules/identity/identity-cleanup.processor';
import { SessionsRepository } from './modules/identity/sessions.repository';

/** Sends queued emails. Retries/backoff come from the queue defaults (ADR-007). */
@Processor(QUEUES.email)
export class EmailProcessor extends WorkerHost {
  constructor(@Inject(EMAIL_ADAPTER) private readonly email: EmailAdapter) {
    super();
  }

  async process(job: Job<EmailJob>): Promise<{ providerMessageId?: string }> {
    const result = await this.email.send(job.data);
    return { ...(result.providerMessageId ? { providerMessageId: result.providerMessageId } : {}) };
  }
}

/** Background worker process: same image as the API, started with `node dist/src/worker.js`. */
@Module({
  imports: [
    AppConfigModule,
    LoggingModule,
    PrismaModule,
    StorageModule,
    EmailModule,
    bullRoot(),
    registerQueues(QUEUES.email, QUEUES.scheduled),
  ],
  providers: [EmailProcessor, SessionsRepository, IdentityCleanupProcessor, IdentityCleanupScheduler],
})
export class WorkerModule {}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
}

if (require.main === module) void bootstrap();
