import { Injectable } from '@nestjs/common';
import { type ScheduledTask } from '../../infra/queue/scheduled-jobs';
import { SessionsRepository } from './sessions.repository';

export const IDENTITY_CLEANUP_JOB = 'identity.cleanup';

/** Daily deletion of expired tokens, resets and verifications (M01 §6), on the `scheduled` queue. */
@Injectable()
export class IdentityCleanupTask implements ScheduledTask {
  readonly name = IDENTITY_CLEANUP_JOB;
  readonly pattern = '17 3 * * *';

  constructor(private readonly sessions: SessionsRepository) {}

  run(now: Date): Promise<Record<string, number>> {
    return this.sessions.deleteExpired(now);
  }
}
