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
import { RateLimitModule } from './infra/rate-limit/rate-limit.module';
import { AuditModule } from './modules/audit/audit.module';
import { HealthModule } from './modules/health/health.module';
import { AuthenticationGuard } from './modules/identity/authentication.guard';
import { IdentityModule } from './modules/identity/identity.module';

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
    RateLimitModule,
    AuditModule,
    HealthModule,
    IdentityModule,
  ],
  providers: [
    // Order matters: authenticate (principal from bearer token) → authorise (@Public/@Authenticated/@Can).
    { provide: APP_GUARD, useExisting: AuthenticationGuard },
    { provide: APP_GUARD, useClass: AuthorizationGuard },
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
  ],
})
export class AppModule {}
