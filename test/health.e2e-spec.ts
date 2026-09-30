import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { type App } from 'supertest/types';
import { createTestApp } from './app';

describe('health (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it('GET /v1/health/live is public and up', async () => {
    await request(app.getHttpServer()).get('/v1/health/live').expect(200, { status: 'ok' });
  });

  it('GET /v1/health/ready checks PostgreSQL and Redis', async () => {
    const res = await request(app.getHttpServer()).get('/v1/health/ready').expect(200);
    expect(res.body).toEqual({ status: 'ok', checks: { database: 'up', redis: 'up' } });
  });

  it('unknown routes return RFC 9457 problem+json', async () => {
    const res = await request(app.getHttpServer()).get('/v1/does-not-exist').expect(404);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(res.body).toMatchObject({ type: 'https://resilisense.org/problems/not_found', status: 404 });
  });

  it('sets security headers and a request id', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/health/live')
      .set('x-request-id', 'test-request-0001');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
