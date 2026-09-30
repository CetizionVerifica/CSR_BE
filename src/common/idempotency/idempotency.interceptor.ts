import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
  SetMetadata,
  UseInterceptors,
  applyDecorators,
} from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { type Redis } from 'ioredis';
import { from, lastValueFrom, type Observable, of } from 'rxjs';
import { REDIS } from '../../infra/redis/redis.module';
import { type RequestWithPrincipal } from '../auth/principal';
import { ProblemError } from '../errors/problem';

const TTL_SEC = 24 * 3600;
const KEY_RE = /^[A-Za-z0-9_-]{8,128}$/;
export const IDEMPOTENT_KEY = 'http:idempotent';

interface Stored {
  status: number;
  body: unknown;
}

/**
 * `Idempotency-Key` for POSTs that send email or start jobs (ADR-004): a repeated key from the same
 * user on the same route returns the first response instead of repeating the side effect.
 * Only successful responses are stored; a concurrent duplicate gets 409.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request & RequestWithPrincipal>();
    const header = req.headers['idempotency-key'];
    if (header === undefined) return next.handle();
    if (typeof header !== 'string' || !KEY_RE.test(header)) {
      throw new ProblemError(
        'validation_failed',
        'Invalid Idempotency-Key',
        'Use 8–128 characters [A-Za-z0-9_-]',
      );
    }
    const actor = req.principal?.userId ?? 'anonymous';
    const key = `idem:${actor}:${req.method}:${req.originalUrl.split('?')[0]}:${header}`;
    return from(this.run(key, http.getResponse<Response>(), next));
  }

  private async run(key: string, res: Response, next: CallHandler): Promise<unknown> {
    const claimed = await this.redis.set(key, 'pending', 'EX', TTL_SEC, 'NX');
    if (!claimed) {
      const raw = await this.redis.get(key);
      if (!raw || raw === 'pending') {
        throw new ProblemError('conflict', 'A request with this Idempotency-Key is in progress');
      }
      const stored = JSON.parse(raw) as Stored;
      res.status(stored.status).setHeader('Idempotent-Replayed', 'true');
      return lastValueFrom(of(stored.body));
    }
    try {
      const body: unknown = await lastValueFrom(next.handle(), { defaultValue: undefined });
      await this.redis.set(
        key,
        JSON.stringify({ status: res.statusCode, body } satisfies Stored),
        'EX',
        TTL_SEC,
      );
      return body;
    } catch (err) {
      await this.redis.del(key);
      throw err;
    }
  }
}

/** Marks a POST as accepting `Idempotency-Key` (documented in OpenAPI). */
export const Idempotent = () =>
  applyDecorators(
    SetMetadata(IDEMPOTENT_KEY, true),
    UseInterceptors(IdempotencyInterceptor),
    ApiHeader({
      name: 'Idempotency-Key',
      required: false,
      description: 'Replays the first response for 24 h',
    }),
  );
