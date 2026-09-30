import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { type App } from 'supertest/types';
import { base32Decode, totp } from '../src/modules/identity/engine/totp';
import { WorkspaceAccessService } from '../src/modules/identity/workspace-access.service';
import { createTestApp } from './app';
import { bearer, IdentityFixtures, PASSWORD, refreshCookie } from './support/identity';

const code = (secret: string, offsetSteps = 0) =>
  totp(base32Decode(secret), Date.now() + offsetSteps * 30_000);

/** M01 §4.2 / §7.1 TOTP MFA, platform users (US-01-5), impersonation, cross-tenant audit. */
describe('identity — MFA & platform (e2e)', () => {
  let app: INestApplication<App>;
  let fx: IdentityFixtures;

  beforeAll(async () => {
    app = await createTestApp();
    fx = new IdentityFixtures(app);
  });
  afterAll(() => app.close());
  beforeEach(() => fx.clearRateLimits());

  async function enableMfa(token: string): Promise<{ secret: string; recoveryCodes: string[] }> {
    const setup = await request(fx.http).post('/v1/auth/mfa/setup').set(bearer(token)).expect(200);
    expect(setup.body.otpauthUri).toMatch(/^otpauth:\/\/totp\/ResiliSense%3A/);
    await request(fx.http)
      .post('/v1/auth/mfa/confirm')
      .set(bearer(token))
      .send({ code: '000000' })
      .expect(400);
    const confirm = await request(fx.http)
      .post('/v1/auth/mfa/confirm')
      .set(bearer(token))
      .send({ code: code(setup.body.secret, -1) })
      .expect(200);
    expect(confirm.body.recoveryCodes).toHaveLength(10);
    expect(confirm.body.session).toBeNull();
    return { secret: setup.body.secret, recoveryCodes: confirm.body.recoveryCodes };
  }

  /** A platform owner with MFA enrolled, logged in. */
  async function platformOwner() {
    const user = await fx.user({ platformRole: 'platform_owner' });
    const login = await request(fx.http)
      .post('/v1/auth/login')
      .send({ email: user.email, password: PASSWORD })
      .expect(200);
    const enroll = login.body.mfaToken as string;
    const setup = await request(fx.http).post('/v1/auth/mfa/setup').set(bearer(enroll)).expect(200);
    const confirm = await request(fx.http)
      .post('/v1/auth/mfa/confirm')
      .set(bearer(enroll))
      .send({ code: code(setup.body.secret) })
      .expect(200);
    return {
      user,
      token: confirm.body.session.accessToken as string,
      secret: setup.body.secret as string,
      cookie: refreshCookie(confirm.headers['set-cookie']),
    };
  }

  it('MFA: setup → confirm → login needs a second factor; codes cannot be replayed; recovery codes are single-use', async () => {
    const user = await fx.user();
    const { token } = await fx.login(user.email);
    const { secret, recoveryCodes } = await enableMfa(token);
    await request(fx.http).post('/v1/auth/mfa/setup').set(bearer(token)).expect(409);
    const stored = await fx.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.mfaTotpSecretEnc).not.toContain(secret);

    const login = await request(fx.http)
      .post('/v1/auth/login')
      .send({ email: user.email, password: PASSWORD })
      .expect(200);
    expect(login.body).toEqual({ mfaRequired: true, mfaToken: expect.any(String) });
    expect(login.headers['set-cookie']).toBeUndefined();
    // The MFA token is not an access token.
    await request(fx.http).get('/v1/me').set(bearer(login.body.mfaToken)).expect(401);

    await request(fx.http)
      .post('/v1/auth/mfa/verify')
      .send({ mfaToken: login.body.mfaToken, code: '123456' })
      .expect(401);
    const now = code(secret);
    const ok = await request(fx.http)
      .post('/v1/auth/mfa/verify')
      .send({ mfaToken: login.body.mfaToken, code: now })
      .expect(200);
    await request(fx.http).get('/v1/me').set(bearer(ok.body.accessToken)).expect(200);
    // Same code again (replay) is rejected.
    await request(fx.http)
      .post('/v1/auth/mfa/verify')
      .send({ mfaToken: login.body.mfaToken, code: now })
      .expect(401);

    const rc = recoveryCodes[0]!;
    await request(fx.http)
      .post('/v1/auth/mfa/verify')
      .send({ mfaToken: login.body.mfaToken, recoveryCode: rc.toUpperCase() })
      .expect(200);
    await request(fx.http)
      .post('/v1/auth/mfa/verify')
      .send({ mfaToken: login.body.mfaToken, recoveryCode: rc })
      .expect(401);
    await request(fx.http).post('/v1/auth/mfa/verify').send({ mfaToken: login.body.mfaToken }).expect(400);

    // Disable requires password + code.
    await request(fx.http)
      .delete('/v1/auth/mfa')
      .set(bearer(ok.body.accessToken))
      .send({ password: 'wrong wrong wrong', code: code(secret, 1) })
      .expect(403);
    await request(fx.http)
      .delete('/v1/auth/mfa')
      .set(bearer(ok.body.accessToken))
      .send({ password: PASSWORD, code: code(secret, 1) })
      .expect(204);
    await fx.login(user.email);
    expect(await fx.auditActions({ entityId: user.id })).toEqual(
      expect.arrayContaining(['auth.mfa.enabled', 'auth.mfa.disabled']),
    );
  });

  it('platform users must enrol MFA; the enrolment token only works for MFA setup', async () => {
    const user = await fx.user({ platformRole: 'platform_support' });
    const login = await request(fx.http)
      .post('/v1/auth/login')
      .send({ email: user.email, password: PASSWORD })
      .expect(200);
    expect(login.body).toEqual({ mfaEnrollmentRequired: true, mfaToken: expect.any(String) });
    const enroll = login.body.mfaToken as string;
    await request(fx.http).get('/v1/me').set(bearer(enroll)).expect(401);
    await request(fx.http).post('/v1/auth/logout').set(bearer(enroll)).expect(401);
    const setup = await request(fx.http).post('/v1/auth/mfa/setup').set(bearer(enroll)).expect(200);
    const confirm = await request(fx.http)
      .post('/v1/auth/mfa/confirm')
      .set(bearer(enroll))
      .send({ code: code(setup.body.secret) })
      .expect(200);
    expect(confirm.body.session).toMatchObject({ tokenType: 'Bearer' });
    expect(confirm.headers['set-cookie']?.[0]).toMatch(/^rs_refresh=/);
    const access = confirm.body.session.accessToken as string;
    // The enrolment token is spent once MFA is on.
    await request(fx.http).post('/v1/auth/mfa/setup').set(bearer(enroll)).expect(401);
    // Platform roles cannot disable MFA.
    await request(fx.http)
      .delete('/v1/auth/mfa')
      .set(bearer(access))
      .send({ password: PASSWORD, code: code(setup.body.secret, 1) })
      .expect(403);
  });

  it('platform routes are for platform owners only', async () => {
    const ws = await fx.workspace();
    const owner = await fx.actor(ws, 'workspace_owner');
    await request(fx.http).get('/v1/platform/users').set(bearer(owner.token)).expect(403);
    const po = await platformOwner();
    const list = await request(fx.http)
      .get(`/v1/platform/users?q=${encodeURIComponent(owner.user.email)}`)
      .set(bearer(po.token))
      .expect(200);
    expect(list.body.items.map((u: { id: string }) => u.id)).toEqual([owner.user.id]);
    // Special characters are data, not patterns.
    await request(fx.http).get('/v1/platform/users?q=%25_%5C').set(bearer(po.token)).expect(200);
  });

  it('US-01-5: a platform owner sees and revokes sessions of any user; platform role/status changes are audited', async () => {
    const po = await platformOwner();
    const user = await fx.user();
    const s = await fx.login(user.email);
    const sessions = await request(fx.http)
      .get(`/v1/platform/users/${user.id}/sessions`)
      .set(bearer(po.token))
      .expect(200);
    expect(sessions.body.items).toHaveLength(1);
    await request(fx.http)
      .delete(`/v1/platform/users/${user.id}/sessions/${sessions.body.items[0].id}`)
      .set(bearer(po.token))
      .expect(204);
    await request(fx.http).get('/v1/me').set(bearer(s.token)).expect(401);

    await request(fx.http)
      .patch(`/v1/platform/users/${po.user.id}`)
      .set(bearer(po.token))
      .send({ platformRole: null })
      .expect(403);
    const updated = await request(fx.http)
      .patch(`/v1/platform/users/${user.id}`)
      .set(bearer(po.token))
      .send({ platformRole: 'platform_assessor' })
      .expect(200);
    expect(updated.body.platformRole).toBe('platform_assessor');
    const s2 = await fx.login(user.email).catch(() => null);
    expect(s2).toBeNull(); // assessor must now enrol MFA first (login returns an MFA step, not a session)

    await request(fx.http)
      .patch(`/v1/platform/users/${user.id}`)
      .set(bearer(po.token))
      .send({ status: 'disabled' })
      .expect(200);
    await request(fx.http).post('/v1/auth/login').send({ email: user.email, password: PASSWORD }).expect(401);
    expect(await fx.auditActions({ entityId: user.id })).toContain('platform.user.updated');
  });

  it('impersonation: banner info, no credential changes, ended token is rejected, never of a platform owner', async () => {
    const ws = await fx.workspace();
    const target = await fx.actor(ws, 'workspace_admin');
    const po = await platformOwner();
    const other = await platformOwner();

    await request(fx.http)
      .post(`/v1/platform/users/${other.user.id}/impersonate`)
      .set(bearer(po.token))
      .send({ reason: 'support ticket 42' })
      .expect(403);
    await request(fx.http)
      .post(`/v1/platform/users/${po.user.id}/impersonate`)
      .set(bearer(po.token))
      .send({ reason: 'support ticket 42' })
      .expect(403);
    await request(fx.http)
      .post(`/v1/platform/users/${target.user.id}/impersonate`)
      .set(bearer(po.token))
      .send({})
      .expect(400);

    const imp = await request(fx.http)
      .post(`/v1/platform/users/${target.user.id}/impersonate`)
      .set(bearer(po.token))
      .send({ reason: 'support ticket 42' })
      .expect(200);
    expect(imp.body).toMatchObject({ expiresIn: 3600, workspaceId: ws });
    expect(imp.headers['set-cookie']).toBeUndefined();
    const t = imp.body.accessToken as string;
    const me = await request(fx.http).get('/v1/me').set(bearer(t)).expect(200);
    expect(me.body.user.id).toBe(target.user.id);
    expect(me.body.impersonatedBy).toEqual({ id: po.user.id, name: po.user.name });
    await request(fx.http).get(`/v1/workspaces/${ws}/members`).set(bearer(t)).expect(200);
    await request(fx.http)
      .post('/v1/me/password')
      .set(bearer(t))
      .send({ currentPassword: PASSWORD, newPassword: 'hijacked passphrase!' })
      .expect(403);
    await request(fx.http)
      .post(`/v1/platform/users/${target.user.id}/impersonate`)
      .set(bearer(t))
      .send({ reason: 'nested attempt' })
      .expect(403);

    await request(fx.http).post('/v1/auth/impersonation/end').set(bearer(t)).expect(204);
    await request(fx.http).get('/v1/me').set(bearer(t)).expect(401);
    await request(fx.http).post('/v1/auth/impersonation/end').set(bearer(po.token)).expect(409);
    const actions = await fx.auditActions({ entityId: target.user.id, actorId: po.user.id });
    expect(actions).toEqual(expect.arrayContaining(['impersonation.started', 'impersonation.ended']));
  });

  it('platform owners/support may open any workspace; every cross-tenant request is audited', async () => {
    const ws = await fx.workspace();
    await fx.actor(ws, 'workspace_owner');
    const po = await platformOwner();
    const sw = await request(fx.http)
      .post('/v1/me/workspace')
      .set(bearer(po.token))
      .send({ workspaceId: ws })
      .expect(200);
    const me = await request(fx.http).get('/v1/me').set(bearer(sw.body.accessToken)).expect(200);
    expect(me.body.currentWorkspace).toMatchObject({ id: ws, crossTenant: true, role: null });
    await request(fx.http).get(`/v1/workspaces/${ws}/members`).set(bearer(sw.body.accessToken)).expect(200);
    const rows = await fx.prisma.withTenant(ws, (tx) =>
      tx.auditEvent.findMany({ where: { actorId: po.user.id } }),
    );
    expect(rows.map((r) => r.action)).toEqual(
      expect.arrayContaining(['workspace.switched', 'platform.cross_tenant_access']),
    );
    expect(rows.filter((r) => r.action === 'platform.cross_tenant_access').map((r) => r.entityId)).toEqual(
      expect.arrayContaining(['GET /v1/me', 'GET /v1/workspaces/:wid/members']),
    );

    // An assessor cannot open arbitrary workspaces (M05 grants review access explicitly).
    const assessor = await fx.user({ platformRole: 'platform_assessor' });
    await expect(app.get(WorkspaceAccessService).resolve(assessor, ws)).resolves.toBeNull();
  });
});
