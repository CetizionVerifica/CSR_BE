import { Controller, Get, HttpCode, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { type Redis } from 'ioredis';
import { z } from 'zod';
import { Public } from '../../common/auth/decorators';
import { ProblemError } from '../../common/errors/problem';
import { ApiZodOk } from '../../common/validation/zod';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { REDIS } from '../../infra/redis/redis.module';

export const healthSchema = z.object({
  status: z.enum(['ok']),
  checks: z.record(z.string(), z.enum(['up', 'down'])).optional(),
});
type Health = z.infer<typeof healthSchema>;

async function check(fn: () => Promise<unknown>, timeoutMs = 2000): Promise<'up' | 'down'> {
  try {
    await Promise.race([
      fn(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
    ]);
    return 'up';
  } catch {
    return 'down';
  }
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** Liveness: the process is running. Used by kamal-proxy / container restarts. */
  @Public()
  @Get('live')
  @HttpCode(200)
  @ApiZodOk(healthSchema)
  live(): Health {
    return { status: 'ok' };
  }

  /** Readiness: dependencies reachable. Deploys wait for this before routing traffic. */
  @Public()
  @Get('ready')
  @ApiZodOk(healthSchema)
  async ready(): Promise<Health> {
    const [database, redis] = await Promise.all([
      check(() => this.prisma.ping()),
      check(() => this.redis.ping()),
    ]);
    const checks = { database, redis };
    if (database === 'down' || redis === 'down') {
      throw new ProblemError('service_unavailable', 'Not ready', undefined, { checks });
    }
    return { status: 'ok', checks };
  }
}
