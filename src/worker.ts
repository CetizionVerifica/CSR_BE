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
import { MalwareModule } from './infra/malware/malware.module';
import { AuditModule } from './modules/audit/audit.module';
import { FileScanService } from './modules/files/file-scan.service';
import { FilesPurgeTask } from './modules/files/files-purge.task';
import { FilesRepository } from './modules/files/files.repository';
import { FilesScanProcessor } from './modules/files/files-scan.processor';
import {
  SCHEDULED_TASKS,
  ScheduledJobsProcessor,
  ScheduledJobsScheduler,
} from './infra/queue/scheduled-jobs';
import { IdentityCleanupTask } from './modules/identity/identity-cleanup.task';
import { SessionsRepository } from './modules/identity/sessions.repository';
import { CompaniesPurgeTask } from './modules/workspaces/companies-purge.task';
import { CompaniesRepository } from './modules/workspaces/companies.repository';

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
    MalwareModule,
    EmailModule,
    AuditModule,
    bullRoot(),
    registerQueues(QUEUES.email, QUEUES.scheduled, QUEUES.files),
  ],
  providers: [
    EmailProcessor,
    SessionsRepository,
    CompaniesRepository,
    IdentityCleanupTask,
    CompaniesPurgeTask,
    FilesRepository,
    FileScanService,
    FilesScanProcessor,
    FilesPurgeTask,
    {
      provide: SCHEDULED_TASKS,
      inject: [IdentityCleanupTask, CompaniesPurgeTask, FilesPurgeTask],
      useFactory: (...tasks: unknown[]) => tasks,
    },
    ScheduledJobsProcessor,
    ScheduledJobsScheduler,
  ],
})
export class WorkerModule {}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
}

if (require.main === module) void bootstrap();
