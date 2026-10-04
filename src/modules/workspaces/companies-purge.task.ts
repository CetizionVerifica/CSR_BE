import { Injectable } from '@nestjs/common';
import { type ScheduledTask } from '../../infra/queue/scheduled-jobs';
import { CompaniesRepository } from './companies.repository';
import { purgeBefore } from './engine/limits';

export const COMPANIES_PURGE_JOB = 'companies.purge';

/**
 * Daily hard delete of companies soft-deleted more than 30 days ago (M02 §4.1, GDPR), per tenant
 * under RLS. Rows of later modules (projects, answers, files) cascade from their company.
 */
@Injectable()
export class CompaniesPurgeTask implements ScheduledTask {
  readonly name = COMPANIES_PURGE_JOB;
  readonly pattern = '37 3 * * *';

  constructor(private readonly companies: CompaniesRepository) {}

  async run(now: Date): Promise<{ purged: number }> {
    const before = purgeBefore(now);
    let purged = 0;
    for (const wid of await this.companies.allWorkspaceIds()) {
      purged += await this.companies.purgeDeleted(wid, before);
    }
    return { purged };
  }
}
