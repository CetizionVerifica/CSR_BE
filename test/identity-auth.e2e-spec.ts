import { type INestApplication } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { type App } from 'supertest/types';
import { createTestApp } from './app';
import { bearer, IdentityFixtures, PASSWORD, refreshCookie, uniqueEmail } from './support/identity';

/** M01 §4.1 sign-in, sessions (ADR-005), lockout, legacy bcrypt upgrade. */
describe('identity — authentication (e2e)', () => {
  let app: INestApplication<App>;
  let fx: IdentityFixtures;

  beforeAll(async () => {
    app = await createTestApp();
    fx = new IdentityFixtures(app);
  });
  afterAll(() => app.close());
  beforeEach(() => fx.clearRateLimits());

  it('logs in: access token + HttpOnly refresh cookie scoped to /v1/auth', async () => {
    const wid = await fx.workspace();
    const user = await fx.user();
    await fx.member(user.id, wid, 'workspace_admin');
    const res = await request(fx.http)
      .post('/v1/auth/login')
      .send({ email: user.email.toUpperCase(), password: PASSWORD })
      .expect(200);
    expect(res.body).toMatchObject({ tokenType: 'Bearer', expiresIn: 900, workspaceId: wid });
    const cookie = ([] as string[])
      .concat(res.headers['set-cookie'] ?? [])
      .find((c) => c.startsWith('rs_refresh='))!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\/v1\/auth/);
    const me = await request(fx.http).get('/v1/me').set(bearer(res.body.accessToken)).expect(200);
    expect(me.body.user.email).toBe(user.email);
    expect(await fx.auditActions({ actorId: user.id })).toContain('auth.login.succeeded');
  });

  it('wrong password and unknown email get the same generic 401', async () => {
    const user = await fx.user();
    const a = await request(fx.http)
      .post('/v1/auth/login')
      .send({ email: user.email, password: 'wrong password 123' })
      .expect(401);
    const b = await request(fx.http)
      .post('/v1/auth/login')
      .send({ email: uniqueEmail('nobody'), password: 'wrong password 123' })
      .expect(401);
    expect(a.body.title).toBe('Invalid email or password');
    expect(b.body.title).toBe(a.body.title);
    expect(a.headers['set-cookie']).toBeUndefined();
  });

  it('locks the account after 10 failed logins in 15 minutes (generic error, even with the right password)', async () => {
    const user = await fx.user();
    for (let i = 0; i < 10; i++) {
      await request(fx.http)
        .post('/v1/auth/login')
        .send({ email: user.email, password: `wrong-password-${i}` })
        .expect(401);
    }
    const locked = await fx.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(locked.lockedUntil!.getTime()).toBeGreaterThan(Date.now() + 14 * 60_000);
    expect(locked.failedLoginCount).toBe(10);
    await request(fx.http).post('/v1/auth/login').send({ email: user.email, password: PASSWORD }).expect(401);
  });

  it('disabled, invited and unverified users cannot sign in', async () => {
    const disabled = await fx.user({ status: 'disabled' });
    await request(fx.http)
      .post('/v1/auth/login')
      .send({ email: disabled.email, password: PASSWORD })
      .expect(401);
    const invited = await fx.user({ status: 'invited', password: null });
    await request(fx.http)
      .post('/v1/auth/login')
      .send({ email: invited.email, password: PASSWORD })
      .expect(401);
    const unverified = await fx.user({ verified: false });
    const res = await request(fx.http)
      .post('/v1/auth/login')
      .send({ email: unverified.email, password: PASSWORD })
      .expect(403);
    expect(res.body.type).toMatch(/email_not_verified$/);
  });

  it('accepts a legacy bcrypt hash and re-hashes it to argon2id (M01 §7)', async () => {
    const user = await fx.user({ passwordHash: await bcrypt.hash(PASSWORD, 4), passwordAlgo: 'bcrypt' });
    await fx.login(user.email);
    const after = await fx.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.passwordAlgo).toBe('argon2id');
    expect(after.passwordHash).toMatch(/^\$argon2id\$/);
    await fx.login(user.email);
  });

  it('refresh rotates the cookie; reusing an old refresh token revokes the whole session', async () => {
    const user = await fx.user();
    const { cookie, token } = await fx.login(user.email);
    const r1 = await request(fx.http).post('/v1/auth/refresh').set('Cookie', cookie).expect(200);
    const cookie2 = refreshCookie(r1.headers['set-cookie']);
    expect(cookie2).not.toBe(cookie);
    await request(fx.http).get('/v1/me').set(bearer(r1.body.accessToken)).expect(200);

    // Replaying the first cookie = theft signal: the family is revoked, incl. the newest token.
    await request(fx.http).post('/v1/auth/refresh').set('Cookie', cookie).expect(401);
    await request(fx.http).post('/v1/auth/refresh').set('Cookie', cookie2).expect(401);
    await request(fx.http).get('/v1/me').set(bearer(token)).expect(401);
    expect(await fx.auditActions({ actorId: user.id })).toContain('auth.refresh.reuse_detected');
  });

  it('refresh without or with a garbage cookie is 401', async () => {
    await request(fx.http).post('/v1/auth/refresh').expect(401);
    await request(fx.http).post('/v1/auth/refresh').set('Cookie', 'rs_refresh=nope').expect(401);
  });

  it('logout revokes the session immediately; ?all=true signs out every device', async () => {
    const user = await fx.user();
    const a = await fx.login(user.email);
    const b = await fx.login(user.email);
    await request(fx.http).post('/v1/auth/logout').set(bearer(a.token)).expect(204);
    await request(fx.http).get('/v1/me').set(bearer(a.token)).expect(401);
    await request(fx.http).post('/v1/auth/refresh').set('Cookie', a.cookie).expect(401);
    await request(fx.http).get('/v1/me').set(bearer(b.token)).expect(200);

    const c = await fx.login(user.email);
    await request(fx.http).post('/v1/auth/logout?all=true').set(bearer(c.token)).expect(204);
    await request(fx.http).get('/v1/me').set(bearer(b.token)).expect(401);
    await request(fx.http).post('/v1/auth/refresh').set('Cookie', b.cookie).expect(401);
  });

  it('lists and revokes own sessions', async () => {
    const user = await fx.user();
    const a = await fx.login(user.email);
    const b = await fx.login(user.email);
    const list = await request(fx.http).get('/v1/me/sessions').set(bearer(a.token)).expect(200);
    expect(list.body.items).toHaveLength(2);
    const other = list.body.items.find((s: { current: boolean }) => !s.current);
    await request(fx.http).delete(`/v1/me/sessions/${other.id}`).set(bearer(a.token)).expect(204);
    await request(fx.http).get('/v1/me').set(bearer(b.token)).expect(401);
    await request(fx.http).delete(`/v1/me/sessions/${other.id}`).set(bearer(a.token)).expect(404);
  });

  it('rejects malformed and forged bearer tokens', async () => {
    await request(fx.http).get('/v1/me').set('Authorization', 'Bearer nope').expect(401);
    await request(fx.http).get('/v1/me').set('Authorization', 'Basic abc').expect(401);
    const user = await fx.user();
    const { token } = await fx.login(user.email);
    const [h, , s] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ sub: user.id, wid: null, sid: null })).toString('base64url');
    await request(fx.http).get('/v1/me').set('Authorization', `Bearer ${h}.${forged}.${s}`).expect(401);
  });

  it('a stale token on a public route is ignored', async () => {
    await request(fx.http)
      .post('/v1/auth/password/forgot')
      .set('Authorization', 'Bearer a.b.c')
      .send({ email: uniqueEmail('x') })
      .expect(202);
  });

  it('changing the password revokes other sessions and keeps the current one', async () => {
    const user = await fx.user();
    const a = await fx.login(user.email);
    const b = await fx.login(user.email);
    await request(fx.http)
      .post('/v1/me/password')
      .set(bearer(a.token))
      .send({ currentPassword: 'wrong wrong wrong', newPassword: 'another fine passphrase' })
      .expect(403);
    await request(fx.http)
      .post('/v1/me/password')
      .set(bearer(a.token))
      .send({ currentPassword: PASSWORD, newPassword: 'short' })
      .expect(400);
    await request(fx.http)
      .post('/v1/me/password')
      .set(bearer(a.token))
      .send({ currentPassword: PASSWORD, newPassword: 'another fine passphrase' })
      .expect(204);
    await request(fx.http).get('/v1/me').set(bearer(a.token)).expect(200);
    await request(fx.http).get('/v1/me').set(bearer(b.token)).expect(401);
    await fx.login(user.email, 'another fine passphrase');
    expect((await fx.emailsTo(user.email)).map((m) => m.subject)).toContain(
      'Your ResiliSense password was changed',
    );
  });

  it('login is rate limited per IP', async () => {
    const email = uniqueEmail('rl');
    let last = 0;
    for (let i = 0; i < 31; i++) {
      last = (await request(fx.http).post('/v1/auth/login').send({ email, password: 'whatever whatever' }))
        .status;
    }
    expect(last).toBe(429);
  });
});
