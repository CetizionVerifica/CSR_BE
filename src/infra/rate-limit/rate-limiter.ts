import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { type Redis } from 'ioredis';
import { ProblemError } from '../../common/errors/problem';
import { REDIS } from '../redis/redis.module';

export interface RateLimitRule {
  /** Logical bucket, e.g. "login:ip". */
  name: string;
  limit: number;
  windowSec: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

export const RATE_LIMIT_PREFIX = 'rl:';

/**
 * Fixed-window counters in Redis/Valkey (ADR-010: stricter limits on auth and public endpoints).
 * Subjects (IPs, emails) are hashed so keys never contain PII.
 */
@Injectable()
export class RateLimiter {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async hit(rule: RateLimitRule, subject: string): Promise<RateLimitResult> {
    const key = `${RATE_LIMIT_PREFIX}${rule.name}:${createHash('sha256').update(subject).digest('hex').slice(0, 32)}`;
    const [[, count], [, ttl]] = (await this.redis.multi().incr(key).ttl(key).exec()) as [
      [null, number],
      [null, number],
    ];
    if (ttl < 0) await this.redis.expire(key, rule.windowSec);
    const retryAfterSec = ttl > 0 ? ttl : rule.windowSec;
    return { allowed: count <= rule.limit, remaining: Math.max(0, rule.limit - count), retryAfterSec };
  }

  /** Throws 429 rate_limited (with Retry-After) when the subject exceeded the rule. */
  async enforce(rule: RateLimitRule, subject: string): Promise<void> {
    const result = await this.hit(rule, subject);
    if (!result.allowed) {
      throw new ProblemError('rate_limited', 'Too many requests', undefined, {
        retryAfter: result.retryAfterSec,
      });
    }
  }

  /** Resets a bucket, e.g. failed-login counters after a successful login. */
  async reset(rule: RateLimitRule, subject: string): Promise<void> {
    await this.redis.del(
      `${RATE_LIMIT_PREFIX}${rule.name}:${createHash('sha256').update(subject).digest('hex').slice(0, 32)}`,
    );
  }
}
