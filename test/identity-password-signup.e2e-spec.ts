import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { type App } from 'supertest/types';
import { createTestApp } from './app';
import { bearer, IdentityFixtures, PASSWORD, uniqueEmail } from './support/identity';

const NEW_PASSWORD = 'a much better passphrase';

/** US-01-2 password reset, M01 §7.1 self-signup, email verification and email change. */
describe('identity — password reset, sign-up, email (e2e)', () => {
  let app: INestApplication<App>;
  let fx: IdentityFixtures;

  beforeAll(async () => {
    app = await createTestApp();
    fx = new IdentityFixtures(app);
  });
  afterAll(() => app.close());
  beforeEach(() => fx.clearRateLimits());

  describe('password reset (US-01-2)', () => {
    it('responds identically whether or not the email exists; only existing users get a link', async () => {
      const user = await fx.user();
      const missing = uniqueEmail('missing');
      const a = await request(fx.http)
        .post('/v1/auth/password/forgot')
        .send({ email: user.email })
        .expect(202);
      const b = await request(fx.http).post('/v1/auth/password/forgot').send({ email: missing }).expect(202);
      expect(a.body).toEqual(b.body);
      expect(await fx.emailsTo(missing)).toEqual([]);
      const token = await fx.linkToken(user.email, 'reset-password');
      const stored = await fx.prisma.passwordReset.findFirstOrThrow({ where: { userId: user.id } });
      expect(stored.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(stored.tokenHash).not.toContain(token);
      const ttl = stored.expiresAt.getTime() - stored.createdAt.getTime();
      expect(Math.abs(ttl - 15 * 60 * 1000)).toBeLessThan(1000);
    });

    it('sets the password once, revokes every session, and the token cannot be reused', async () => {
      const user = await fx.user();
      const session = await fx.login(user.email);
      await request(fx.http).post('/v1/auth/password/forgot').send({ email: user.email }).expect(202);
      const token = await fx.linkToken(user.email, 'reset-password');

      await request(fx.http)
        .post('/v1/auth/password/reset')
        .send({ token, password: 'password1234' })
        .expect(400);
      await request(fx.http)
        .post('/v1/auth/password/reset')
        .send({ token, password: NEW_PASSWORD })
        .expect(204);
      await request(fx.http).get('/v1/me').set(bearer(session.token)).expect(401);
      await request(fx.http).post('/v1/auth/refresh').set('Cookie', session.cookie).expect(401);
      const again = await request(fx.http)
        .post('/v1/auth/password/reset')
        .send({ token, password: NEW_PASSWORD })
        .expect(400);
      expect(again.body.type).toMatch(/invalid_token$/);
      await fx.login(user.email, NEW_PASSWORD);
      expect(await fx.auditActions({ entityId: user.id })).toEqual(
        expect.arrayContaining(['auth.password.reset.requested', 'auth.password.reset.completed']),
      );
    });

    it('rejects an expired token', async () => {
      const user = await fx.user();
      await request(fx.http).post('/v1/auth/password/forgot').send({ email: user.email }).expect(202);
      const token = await fx.linkToken(user.email, 'reset-password');
      await fx.prisma.passwordReset.updateMany({
        where: { userId: user.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await request(fx.http)
        .post('/v1/auth/password/reset')
        .send({ token, password: NEW_PASSWORD })
        .expect(400);
    });

    it('activates a migrated user without password (status invited)', async () => {
      const user = await fx.user({ status: 'invited', password: null });
      await request(fx.http).post('/v1/auth/password/forgot').send({ email: user.email }).expect(202);
      const token = await fx.linkToken(user.email, 'reset-password');
      await request(fx.http)
        .post('/v1/auth/password/reset')
        .send({ token, password: NEW_PASSWORD })
        .expect(204);
      await fx.login(user.email, NEW_PASSWORD);
    });

    it('limits requests to 5 per hour per IP (429) and per email (silently)', async () => {
      const user = await fx.user();
      for (let i = 0; i < 5; i++)
        await request(fx.http).post('/v1/auth/password/forgot').send({ email: user.email }).expect(202);
      const res = await request(fx.http)
        .post('/v1/auth/password/forgot')
        .send({ email: user.email })
        .expect(429);
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
      expect(await fx.emailsTo(user.email)).toHaveLength(5);
    });

    it('a reset unlocks a locked account', async () => {
      const user = await fx.user();
      await fx.prisma.user.update({
        where: { id: user.id },
        data: { lockedUntil: new Date(Date.now() + 600_000), failedLoginCount: 10 },
      });
      await request(fx.http).post('/v1/auth/password/forgot').send({ email: user.email }).expect(202);
      const token = await fx.linkToken(user.email, 'reset-password');
      await request(fx.http)
        .post('/v1/auth/password/reset')
        .send({ token, password: NEW_PASSWORD })
        .expect(204);
      await fx.login(user.email, NEW_PASSWORD);
    });
  });

  describe('self-service sign-up (M01 §7.1)', () => {
    it('sign-up → verify email → trial workspace as owner → login', async () => {
      const email = uniqueEmail('signup');
      await request(fx.http)
        .post('/v1/auth/signup')
        .send({ name: 'Sam Signup', email, password: PASSWORD, workspaceName: 'Green Widgets' })
        .expect(202, { status: 'accepted' });
      const blocked = await request(fx.http)
        .post('/v1/auth/login')
        .send({ email, password: PASSWORD })
        .expect(403);
      expect(blocked.body.type).toMatch(/email_not_verified$/);

      const token = await fx.linkToken(email, 'verify-email');
      await request(fx.http)
        .post('/v1/auth/verify-email')
        .send({ token })
        .expect(200, { status: 'verified', purpose: 'signup' });
      await request(fx.http).post('/v1/auth/verify-email').send({ token }).expect(400);

      const { token: access, workspaceId } = await fx.login(email);
      const me = await request(fx.http).get('/v1/me').set(bearer(access)).expect(200);
      expect(me.body.currentWorkspace).toMatchObject({
        id: workspaceId,
        name: 'Green Widgets',
        status: 'trial',
        role: 'workspace_owner',
      });
      expect(me.body.entitlements).toMatchObject({
        plan: 'trial',
        modules: ['gap'],
        limits: { companies: 1, users: 5, projectsPerYear: 1 },
      });
      expect(me.body.permissions).toContain('gap:answer');
      expect(me.body.permissions).not.toContain('survey:send'); // module not in the trial
      expect(me.body.termsAcceptanceRequired).toBe(true);
    });

    it('an existing email gets the same response and an "account exists" email instead', async () => {
      const user = await fx.user();
      await request(fx.http)
        .post('/v1/auth/signup')
        .send({ name: 'Someone', email: user.email, password: PASSWORD, workspaceName: 'Dup' })
        .expect(202, { status: 'accepted' });
      const mails = await fx.emailsTo(user.email);
      expect(mails.map((m) => m.subject)).toEqual(['You already have a ResiliSense account']);
    });

    it('enforces the password policy and validates input', async () => {
      const email = uniqueEmail('weak');
      const res = await request(fx.http)
        .post('/v1/auth/signup')
        .send({ name: 'Weak', email, password: 'password1234', workspaceName: 'W' + 'x' })
        .expect(400);
      expect(res.body.errors[0]).toMatchObject({ path: 'password', code: 'too_weak' });
      await request(fx.http).post('/v1/auth/signup').send({ email, password: PASSWORD }).expect(400);
      await request(fx.http)
        .post('/v1/auth/signup')
        .send({ name: 'X', email, password: PASSWORD, workspaceName: 'WS', role: 'platform_owner' })
        .expect(400); // strict body: no role selection at sign-up
    });

    it('resends the verification link for unverified accounts only', async () => {
      const email = uniqueEmail('resend');
      await request(fx.http)
        .post('/v1/auth/signup')
        .send({ name: 'R', email, password: PASSWORD, workspaceName: 'Resend Co' })
        .expect(202);
      await request(fx.http).post('/v1/auth/verify-email/resend').send({ email }).expect(202);
      expect(await fx.emailsTo(email)).toHaveLength(2);
      const token = await fx.linkToken(email, 'verify-email');
      await request(fx.http).post('/v1/auth/verify-email').send({ token }).expect(200);
      await request(fx.http).post('/v1/auth/verify-email/resend').send({ email }).expect(202);
      expect(await fx.emailsTo(email)).toHaveLength(2);
      const { token: access } = await fx.login(email);
      const me = await request(fx.http).get('/v1/me').set(bearer(access)).expect(200);
      expect(me.body.currentWorkspace.name).toBe('Resend Co');
    });
  });

  describe('email change & terms', () => {
    it('changes the email after confirming the new address; the old address is notified', async () => {
      const user = await fx.user();
      const { token } = await fx.login(user.email);
      const newEmail = uniqueEmail('new');
      await request(fx.http)
        .post('/v1/me/email')
        .set(bearer(token))
        .send({ newEmail, password: 'wrong wrong wrong' })
        .expect(403);
      await request(fx.http)
        .post('/v1/me/email')
        .set(bearer(token))
        .send({ newEmail, password: PASSWORD })
        .expect(202);
      const link = await fx.linkToken(newEmail, 'verify-email');
      await request(fx.http)
        .post('/v1/auth/verify-email')
        .send({ token: link })
        .expect(200, { status: 'verified', purpose: 'email_change' });
      await fx.login(newEmail);
      expect((await fx.emailsTo(user.email)).map((m) => m.subject)).toContain(
        'Your ResiliSense email address was changed',
      );
    });

    it('does not reveal that the new email is taken', async () => {
      const user = await fx.user();
      const other = await fx.user();
      const { token } = await fx.login(user.email);
      await request(fx.http)
        .post('/v1/me/email')
        .set(bearer(token))
        .send({ newEmail: other.email, password: PASSWORD })
        .expect(202);
      expect(await fx.emailsTo(other.email)).toEqual([]);
    });

    it('records terms acceptance with version and timestamp', async () => {
      const user = await fx.user();
      const { token } = await fx.login(user.email);
      await request(fx.http).post('/v1/me/terms').set(bearer(token)).send({ version: '1999-01' }).expect(400);
      await request(fx.http).post('/v1/me/terms').set(bearer(token)).send({ version: '2026-09' }).expect(204);
      const me = await request(fx.http).get('/v1/me').set(bearer(token)).expect(200);
      expect(me.body.termsAcceptanceRequired).toBe(false);
      expect(me.body.user.termsAcceptedAt).toBeTruthy();
    });

    it('updates the profile; platformRole cannot be set through /me', async () => {
      const user = await fx.user();
      const { token } = await fx.login(user.email);
      const res = await request(fx.http)
        .patch('/v1/me')
        .set(bearer(token))
        .send({ name: 'New Name', timezone: 'Europe/Bucharest', locale: 'ro', theme: 'dark' })
        .expect(200);
      expect(res.body).toMatchObject({
        name: 'New Name',
        timezone: 'Europe/Bucharest',
        locale: 'ro',
        theme: 'dark',
      });
      await request(fx.http)
        .patch('/v1/me')
        .set(bearer(token))
        .send({ timezone: 'Mars/Olympus' })
        .expect(400);
      await request(fx.http)
        .patch('/v1/me')
        .set(bearer(token))
        .send({ platformRole: 'platform_owner' })
        .expect(400);
      await request(fx.http).patch('/v1/me').set(bearer(token)).send({ role: 'workspace_owner' }).expect(400);
    });
  });
});
