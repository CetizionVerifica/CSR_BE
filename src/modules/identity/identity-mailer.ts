import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { type Queue } from 'bullmq';
import { AppConfig } from '../../config/app-config';
import { type EmailJob, QUEUES } from '../../infra/queue/queues';

/** Queues identity emails; the worker sends them (side effects never in the request path). */
@Injectable()
export class IdentityMailer {
  constructor(
    @InjectQueue(QUEUES.email) private readonly queue: Queue<EmailJob>,
    private readonly config: AppConfig,
  ) {}

  /** SPA link, e.g. link('/reset-password', token) → https://app…/reset-password/<token>. */
  link(path: string, token?: string): string {
    const base = this.config.get('APP_BASE_URL').replace(/\/$/, '');
    return token ? `${base}${path}/${encodeURIComponent(token)}` : `${base}${path}`;
  }

  async send(job: EmailJob): Promise<void> {
    await this.queue.add('identity', job);
  }
}
