import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { PROBLEM_TYPES, type ProblemBody, ProblemError, type ProblemType, problemTypeUri } from './problem';

const STATUS_TO_TYPE: Record<number, ProblemType> = {
  400: 'validation_failed',
  401: 'unauthenticated',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  429: 'rate_limited',
  503: 'service_unavailable',
};

/** Converts every error into application/problem+json. Never leaks stack traces or internals. */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { id?: string }>();
    const res = ctx.getResponse<Response>();
    const body = this.toProblem(exception);
    body.instance = req.originalUrl;
    if (req.id) body.requestId = String(req.id);
    if (typeof body.retryAfter === 'number') res.setHeader('Retry-After', String(body.retryAfter));
    if (body.status >= 500)
      this.logger.error({ err: exception, requestId: body.requestId }, 'Unhandled error');
    res.status(body.status).type('application/problem+json').json(body);
  }

  private toProblem(exception: unknown): ProblemBody {
    if (exception instanceof ProblemError) {
      return {
        type: problemTypeUri(exception.type),
        title: exception.title,
        status: exception.status,
        ...(exception.detail ? { detail: exception.detail } : {}),
        ...exception.extensions,
      };
    }
    if (exception instanceof ZodError) {
      return {
        type: problemTypeUri('validation_failed'),
        title: 'Request validation failed',
        status: PROBLEM_TYPES.validation_failed,
        errors: exception.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const type = STATUS_TO_TYPE[status] ?? (status >= 500 ? 'internal_error' : 'validation_failed');
      return { type: problemTypeUri(type), title: exception.message, status };
    }
    return {
      type: problemTypeUri('internal_error'),
      title: 'Internal server error',
      status: PROBLEM_TYPES.internal_error,
    };
  }
}
