import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** Request facts that services record in sessions and audit events. */
export interface RequestMeta {
  requestId: string | null;
  ip: string | null;
  userAgent: string | null;
}

export function requestMetaOf(req: Request & { id?: unknown }): RequestMeta {
  const ua = req.headers['user-agent'];
  return {
    requestId: typeof req.id === 'string' || typeof req.id === 'number' ? String(req.id) : null,
    ip: req.ip ?? null,
    userAgent: typeof ua === 'string' ? ua.slice(0, 512) : null,
  };
}

export const ReqMeta = createParamDecorator((_data: unknown, ctx: ExecutionContext): RequestMeta =>
  requestMetaOf(ctx.switchToHttp().getRequest<Request>()),
);

/** Minimal Cookie header parser (no cookie-parser dependency); first occurrence wins. */
export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) {
      try {
        return decodeURIComponent(part.slice(idx + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}
