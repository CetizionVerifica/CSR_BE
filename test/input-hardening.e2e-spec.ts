import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { type App } from 'supertest/types';
import { createTestApp } from './app';
import { bearer, IdentityFixtures } from './support/identity';

/** Inputs found by API fuzzing (CI test plan B4) that used to answer 500. */
describe('input hardening (e2e)', () => {
  let app: INestApplication<App>;
  let fx: IdentityFixtures;
  let token: string;

  beforeAll(async () => {
    app = await createTestApp();
    fx = new IdentityFixtures(app);
    ({ token } = await fx.actor(await fx.workspace(), 'workspace_owner'));
  });
  afterAll(() => app.close());

  it('an oversized JSON body is 413 payload_too_large, not 500', async () => {
    const res = await request(fx.http)
      .patch('/v1/me')
      .set(bearer(token))
      .send({ name: 'x'.repeat(200_000) })
      .expect(413);
    expect(res.body).toMatchObject({
      type: 'https://resilisense.org/problems/payload_too_large',
      status: 413,
    });
  });

  it('a NUL character in any string is 400 validation_failed, before it reaches PostgreSQL', async () => {
    const res = await request(fx.http)
      .patch('/v1/me')
      .set(bearer(token))
      .send({ name: 'Ada\u0000Lovelace' })
      .expect(400);
    expect(res.body).toMatchObject({
      type: 'https://resilisense.org/problems/validation_failed',
      errors: [{ path: 'name', message: expect.stringMatching(/NUL/) }],
    });
  });
});
