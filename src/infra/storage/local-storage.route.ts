import { type INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { problemTypeUri, PROBLEM_TYPES, type ProblemType } from '../../common/errors/problem';
import { LocalStorageAdapter } from './local.storage';
import { STORAGE_ADAPTER, type StorageAdapter } from './storage.adapter';

export const LOCAL_STORAGE_PATH = '/v1/_local-storage/';

function problem(res: Response, type: ProblemType, title: string): void {
  res
    .status(PROBLEM_TYPES[type])
    .type('application/problem+json')
    .json({ type: problemTypeUri(type), title, status: PROBLEM_TYPES[type] });
}

/** Reads the request body, refusing more than `max` bytes. */
function readBody(req: Request, max: number): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > max) {
        req.removeAllListeners('data');
        req.resume();
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * Stand-in for the object store's presigned URLs when STORAGE_DRIVER=local (development, tests,
 * cloud sessions): `PUT` stores the body, `GET` serves it, both only with a valid signature from
 * LocalStorageAdapter. Plain Express middleware, so it is not part of the API contract; never
 * mounted with the s3 driver.
 */
export function mountLocalStorage(app: INestApplication): void {
  const storage = app.get<StorageAdapter>(STORAGE_ADAPTER);
  if (!(storage instanceof LocalStorageAdapter)) return;

  app.use(LOCAL_STORAGE_PATH, (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'PUT' && req.method !== 'GET') return next();
    void (async () => {
      let key: string;
      try {
        key = decodeURIComponent(req.path.replace(/^\//, ''));
      } catch {
        return problem(res, 'forbidden', 'Invalid or expired link');
      }
      const grant = storage.verify(req.method, key, req.query);
      if (!grant) return problem(res, 'forbidden', 'Invalid or expired link');
      // Uploaded/served files may be shown by the app's origin (images, PDF preview).
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

      if (grant.method === 'GET') {
        const info = await storage.head(key);
        if (!info) return problem(res, 'not_found', 'Not found');
        res.setHeader('Content-Type', grant.contentType);
        res.setHeader('Content-Disposition', grant.contentDisposition);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader(
          'Content-Security-Policy',
          "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
        );
        res.status(200).send(await storage.get(key));
        return;
      }

      const type = String(req.headers['content-type'] ?? '')
        .split(';')[0]!
        .trim()
        .toLowerCase();
      if (type !== grant.contentType.toLowerCase())
        return problem(res, 'forbidden', 'Content-Type differs from the signed upload');
      const body = await readBody(req, grant.contentLength);
      if (!body) return problem(res, 'payload_too_large', 'Larger than the declared size');
      if (body.length !== grant.contentLength)
        return problem(res, 'validation_failed', 'Body length differs from the declared size');
      await storage.put(key, body, grant.contentType);
      res.status(200).end();
    })().catch(next);
  });
}
