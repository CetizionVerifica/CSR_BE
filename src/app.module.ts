import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AuthorizationGuard } from './common/auth/authorization.guard';
import { ProblemDetailsFilter } from './common/errors/problem-details.filter';
import { AppConfigModule } from './config/config.module';
import { EmailModule } from './infra/email/email.module';
import { LoggingModule } from './infra/logging/logging.module';
import { PrismaModule } from './infra/prisma/prisma.module';
import { bullRoot, QUEUES, registerQueues } from './infra/queue/queues';
import { RedisModule } from './infra/redis/redis.module';
import { StorageModule } from './infra/storage/storage.module';
import { HealthModule } from './modules/health/health.module';

/**
 * HTTP application. Feature modules (docs/revamp/modules/Mxx) are added under src/modules/
 * and registered here, one per PR.
 */
@Module({
  imports: [
    AppConfigModule,
    LoggingModule,
    PrismaModule,
    RedisModule,
    StorageModule,
    EmailModule,
    bullRoot(),
    registerQueues(QUEUES.email),
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthorizationGuard },
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
  ],
})
export class AppModule {}
