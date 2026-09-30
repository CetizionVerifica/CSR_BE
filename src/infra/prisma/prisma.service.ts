import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppConfig } from '../../config/app-config';
import { type Prisma, PrismaClient } from '../../generated/prisma/client';
import { UUID_RE } from '../../common/ids';

export type TenantTx = Prisma.TransactionClient;

/**
 * Single Prisma client for the process. Repositories are the only callers (CLAUDE.md).
 *
 * Tenant-owned tables are protected by PostgreSQL RLS; queries against them must run inside
 * `withTenant(workspaceId, tx => …)`, which sets `app.workspace_id` for that transaction only.
 * Outside it, RLS returns no rows — deny by default.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: AppConfig) {
    super({ adapter: new PrismaPg({ connectionString: config.get('DATABASE_URL') }) });
  }

  async withTenant<T>(workspaceId: string, fn: (tx: TenantTx) => Promise<T>): Promise<T> {
    if (!UUID_RE.test(workspaceId)) throw new Error('withTenant requires a workspace UUID');
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.workspace_id', ${workspaceId}, true)`;
      return fn(tx);
    });
  }

  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
