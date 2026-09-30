import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { type App } from 'supertest/types';
import { uuidv7 } from '../src/common/ids';
import { createTestApp } from './app';
import { bearer, IdentityFixtures, PASSWORD, uniqueEmail } from './support/identity';

/** US-01-1 invitations, US-01-3 workspace switch, M01 §7 membership rules, tenancy (404). */
describe('identity — members, invitations, workspaces (e2e)', () => {
  let app: INestApplication<App>;
  let fx: IdentityFixtures;

  beforeAll(async () => {
    app = await createTestApp();
    fx = new IdentityFixtures(app);
  });
  afterAll(() => app.close());
  beforeEach(() => fx.clearRateLimits());

  it('US-01-1: invite a contributor limited to a project → accept → login → switch workspace → logout', async () => {
    const wsA = await fx.workspace({ name: 'Alpha' });
    const wsB = await fx.workspace({ name: 'Bravo' });
    const admin = await fx.actor(wsA, 'workspace_admin');
    const projectId = uuidv7();
    const email = uniqueEmail('invitee');

    const inv = await request(fx.http)
      .post(`/v1/workspaces/${wsA}/invitations`)
      .set(bearer(admin.token))
      .send({ invitations: [{ email, role: 'contributor', projectIds: [projectId] }] })
      .expect(201);
    expect(inv.body.results).toEqual([{ email, status: 'invited', invitationId: expect.any(String) }]);
    const token = await fx.linkToken(email, 'accept-invite');
    const row = await fx.prisma.withTenant(wsA, (tx) => tx.invitation.findFirstOrThrow({ where: { email } }));
    expect(row.expiresAt.getTime() - Date.now()).toBeGreaterThan(7 * 24 * 3600_000 - 60_000);

    await request(fx.http)
      .post('/v1/invitations/accept')
      .send({ token, name: 'Ivy', password: 'password1234' })
      .expect(400);
    await request(fx.http)
      .post('/v1/invitations/accept')
      .send({ token, name: 'Ivy Invitee', password: PASSWORD })
      .expect(200, { status: 'accepted', workspaceId: wsA, newUser: true });
    await request(fx.http)
      .post('/v1/invitations/accept')
      .send({ token, name: 'Ivy', password: PASSWORD })
      .expect(400);

    const ivy = await fx.prisma.user.findUniqueOrThrow({ where: { email } });
    expect(await fx.auditActions({ workspaceId: wsA, actorId: ivy.id })).toEqual([
      'invitation.accepted',
      'membership.created',
    ]);
    expect(await fx.auditActions({ workspaceId: wsA, actorId: admin.user.id })).toContain('user.invited');

    // Second workspace for the same user, then login lands in the requested one.
    await fx.member(ivy.id, wsB, 'viewer');
    const session = await fx.login(email, PASSWORD, wsA);
    const me = await request(fx.http).get('/v1/me').set(bearer(session.token)).expect(200);
    expect(me.body.currentWorkspace).toMatchObject({
      id: wsA,
      role: 'contributor',
      scope: { projectIds: [projectId], companyIds: [] },
    });
    expect(me.body.memberships.map((m: { workspaceId: string }) => m.workspaceId).sort()).toEqual(
      [wsA, wsB].sort(),
    );
    expect(me.body.permissions).toEqual([
      'evidence:upload',
      'gap:answer',
      'kpi:enter',
      'project:read',
      'report:export',
    ]);

    // US-01-3: switching re-issues the token; the session remembers the workspace on refresh.
    const sw = await request(fx.http)
      .post('/v1/me/workspace')
      .set(bearer(session.token))
      .send({ workspaceId: wsB })
      .expect(200);
    const meB = await request(fx.http).get('/v1/me').set(bearer(sw.body.accessToken)).expect(200);
    expect(meB.body.currentWorkspace).toMatchObject({ id: wsB, role: 'viewer' });
    expect(meB.body.permissions).toEqual(['project:read', 'report:export']);
    const refreshed = await request(fx.http)
      .post('/v1/auth/refresh')
      .set('Cookie', session.cookie)
      .expect(200);
    expect(refreshed.body.workspaceId).toBe(wsB);
    // Cannot switch into a workspace without membership.
    const wsC = await fx.workspace();
    await request(fx.http)
      .post('/v1/me/workspace')
      .set(bearer(sw.body.accessToken))
      .send({ workspaceId: wsC })
      .expect(404);

    await request(fx.http).post('/v1/auth/logout').set(bearer(sw.body.accessToken)).expect(204);
    await request(fx.http).get('/v1/me').set(bearer(sw.body.accessToken)).expect(401);
  });

  it('an existing user accepts without a password; an already-member gets 409', async () => {
    const ws = await fx.workspace();
    const owner = await fx.actor(ws, 'workspace_owner');
    const existing = await fx.user();
    await request(fx.http)
      .post(`/v1/workspaces/${ws}/invitations`)
      .set(bearer(owner.token))
      .send({ invitations: [{ email: existing.email, role: 'viewer' }] })
      .expect(201);
    const token = await fx.linkToken(existing.email, 'accept-invite');
    await request(fx.http)
      .post('/v1/invitations/accept')
      .send({ token })
      .expect(200, { status: 'accepted', workspaceId: ws, newUser: false });

    const again = await request(fx.http)
      .post(`/v1/workspaces/${ws}/invitations`)
      .set(bearer(owner.token))
      .send({ invitations: [{ email: existing.email, role: 'viewer' }] })
      .expect(201);
    expect(again.body.results[0].status).toBe('already_member');
  });

  it('an unverified sign-up cannot hijack an invitation to the same address', async () => {
    const ws = await fx.workspace();
    const owner = await fx.actor(ws, 'workspace_owner');
    const victim = uniqueEmail('victim');
    // A squatter registers the victim's address with their own password but never verifies it.
    await request(fx.http)
      .post('/v1/auth/signup')
      .send({ name: 'Squatter', email: victim, password: PASSWORD, workspaceName: 'Squat' })
      .expect(202);
    await request(fx.http)
      .post(`/v1/workspaces/${ws}/invitations`)
      .set(bearer(owner.token))
      .send({ invitations: [{ email: victim, role: 'workspace_admin' }] })
      .expect(201);
    const token = await fx.linkToken(victim, 'accept-invite');
    await request(fx.http).post('/v1/invitations/accept').send({ token }).expect(400); // password required
    await request(fx.http)
      .post('/v1/invitations/accept')
      .send({ token, password: 'the real owner passphrase' })
      .expect(200, { status: 'accepted', workspaceId: ws, newUser: false });
    await request(fx.http).post('/v1/auth/login').send({ email: victim, password: PASSWORD }).expect(401);
    await fx.login(victim, 'the real owner passphrase', ws);
  });

  it('rejects forged, expired and revoked invitation tokens', async () => {
    const ws = await fx.workspace();
    const owner = await fx.actor(ws, 'workspace_owner');
    const email = uniqueEmail('rev');
    const res = await request(fx.http)
      .post(`/v1/workspaces/${ws}/invitations`)
      .set(bearer(owner.token))
      .send({ invitations: [{ email, role: 'viewer' }] })
      .expect(201);
    const token = await fx.linkToken(email, 'accept-invite');
    await request(fx.http)
      .post('/v1/invitations/accept')
      .send({ token: 'x'.repeat(64) })
      .expect(400);
    await fx.prisma.withTenant(ws, (tx) =>
      tx.invitation.updateMany({ data: { expiresAt: new Date(Date.now() - 1) } }),
    );
    await request(fx.http)
      .post('/v1/invitations/accept')
      .send({ token, name: 'N', password: PASSWORD })
      .expect(400);

    // resend renews the token and expiry; delete revokes it
    const id = res.body.results[0].invitationId as string;
    await request(fx.http)
      .post(`/v1/workspaces/${ws}/invitations/${id}/resend`)
      .set(bearer(owner.token))
      .expect(200);
    const renewed = await fx.linkToken(email, 'accept-invite');
    expect(renewed).not.toBe(token);
    const list = await request(fx.http)
      .get(`/v1/workspaces/${ws}/invitations`)
      .set(bearer(owner.token))
      .expect(200);
    expect(list.body.items).toHaveLength(1);
    await request(fx.http)
      .delete(`/v1/workspaces/${ws}/invitations/${id}`)
      .set(bearer(owner.token))
      .expect(204);
    await request(fx.http)
      .post('/v1/invitations/accept')
      .send({ token: renewed, name: 'N', password: PASSWORD })
      .expect(400);
  });

  it('role ceiling: admins cannot grant owner; viewers cannot manage users (403)', async () => {
    const ws = await fx.workspace();
    const admin = await fx.actor(ws, 'workspace_admin');
    const viewer = await fx.actor(ws, 'viewer');
    await request(fx.http)
      .post(`/v1/workspaces/${ws}/invitations`)
      .set(bearer(admin.token))
      .send({ invitations: [{ email: uniqueEmail('o'), role: 'workspace_owner' }] })
      .expect(403);
    await request(fx.http).get(`/v1/workspaces/${ws}/members`).set(bearer(viewer.token)).expect(403);
    await request(fx.http)
      .post(`/v1/workspaces/${ws}/invitations`)
      .set(bearer(viewer.token))
      .send({ invitations: [{ email: uniqueEmail('v'), role: 'viewer' }] })
      .expect(403);
  });

  it('another workspace is 404, never 403 (tenancy)', async () => {
    const wsA = await fx.workspace();
    const wsB = await fx.workspace();
    const adminB = await fx.actor(wsB, 'workspace_owner');
    const ownerA = await fx.actor(wsA, 'workspace_owner');
    const membershipA = await fx.prisma.membership.findFirstOrThrow({ where: { workspaceId: wsA } });
    await request(fx.http).get(`/v1/workspaces/${wsA}/members`).set(bearer(adminB.token)).expect(404);
    await request(fx.http)
      .patch(`/v1/workspaces/${wsA}/members/${membershipA.id}`)
      .set(bearer(adminB.token))
      .send({ role: 'viewer' })
      .expect(404);
    await request(fx.http)
      .delete(`/v1/workspaces/${wsA}/members/${membershipA.id}`)
      .set(bearer(adminB.token))
      .expect(404);
    await request(fx.http)
      .post(`/v1/workspaces/${wsA}/invitations`)
      .set(bearer(adminB.token))
      .send({ invitations: [{ email: uniqueEmail('x'), role: 'viewer' }] })
      .expect(404);
    // A membership id of workspace A addressed through workspace B is also 404.
    await request(fx.http)
      .patch(`/v1/workspaces/${wsB}/members/${membershipA.id}`)
      .set(bearer(adminB.token))
      .send({ role: 'viewer' })
      .expect(404);
    // Company scope must reference companies of the same workspace.
    const companyA = await fx.company(wsA);
    await request(fx.http)
      .post(`/v1/workspaces/${wsB}/invitations`)
      .set(bearer(adminB.token))
      .send({ invitations: [{ email: uniqueEmail('c'), role: 'contributor', companyIds: [companyA.id] }] })
      .expect(400);
    await request(fx.http)
      .post(`/v1/workspaces/${wsA}/invitations`)
      .set(bearer(ownerA.token))
      .send({ invitations: [{ email: uniqueEmail('c'), role: 'contributor', companyIds: [companyA.id] }] })
      .expect(201);
  });

  it('nobody changes their own role; a workspace keeps ≥ 1 owner; admins cannot touch owners', async () => {
    const ws = await fx.workspace();
    const owner = await fx.actor(ws, 'workspace_owner');
    const admin = await fx.actor(ws, 'workspace_admin');
    const ownerM = await fx.prisma.membership.findFirstOrThrow({
      where: { workspaceId: ws, userId: owner.user.id },
    });
    const adminM = await fx.prisma.membership.findFirstOrThrow({
      where: { workspaceId: ws, userId: admin.user.id },
    });

    await request(fx.http)
      .patch(`/v1/workspaces/${ws}/members/${adminM.id}`)
      .set(bearer(admin.token))
      .send({ role: 'workspace_owner' })
      .expect(403);
    await request(fx.http)
      .patch(`/v1/workspaces/${ws}/members/${ownerM.id}`)
      .set(bearer(owner.token))
      .send({ role: 'viewer' })
      .expect(403);
    await request(fx.http)
      .patch(`/v1/workspaces/${ws}/members/${ownerM.id}`)
      .set(bearer(admin.token))
      .send({ role: 'viewer' })
      .expect(403);
    await request(fx.http)
      .delete(`/v1/workspaces/${ws}/members/${ownerM.id}`)
      .set(bearer(admin.token))
      .expect(403);
    // The only owner cannot leave.
    const leave = await request(fx.http)
      .delete(`/v1/workspaces/${ws}/members/${ownerM.id}`)
      .set(bearer(owner.token))
      .expect(409);
    expect(leave.body.type).toMatch(/conflict$/);

    // Promote the admin, then the old owner may be demoted by the new owner.
    const promoted = await request(fx.http)
      .patch(`/v1/workspaces/${ws}/members/${adminM.id}`)
      .set(bearer(owner.token))
      .send({ role: 'workspace_owner' })
      .expect(200);
    expect(promoted.body.role).toBe('workspace_owner');
    await request(fx.http)
      .patch(`/v1/workspaces/${ws}/members/${ownerM.id}`)
      .set(bearer(admin.token))
      .send({ role: 'viewer' })
      .expect(200);
    expect(await fx.auditActions({ workspaceId: ws, entityId: adminM.id })).toContain('membership.updated');
  });

  it('deactivating or removing a member takes effect on the next request', async () => {
    const ws = await fx.workspace();
    const owner = await fx.actor(ws, 'workspace_owner');
    const admin = await fx.actor(ws, 'workspace_admin');
    const adminM = await fx.prisma.membership.findFirstOrThrow({
      where: { workspaceId: ws, userId: admin.user.id },
    });
    await request(fx.http).get(`/v1/workspaces/${ws}/members`).set(bearer(admin.token)).expect(200);

    await request(fx.http)
      .patch(`/v1/workspaces/${ws}/members/${adminM.id}`)
      .set(bearer(owner.token))
      .send({ active: false })
      .expect(200);
    await request(fx.http).get(`/v1/workspaces/${ws}/members`).set(bearer(admin.token)).expect(404);
    const listed = await request(fx.http)
      .get(`/v1/workspaces/${ws}/members?status=deactivated`)
      .set(bearer(owner.token))
      .expect(200);
    expect(listed.body.items.map((m: { id: string; status: string }) => [m.id, m.status])).toEqual([
      [adminM.id, 'deactivated'],
    ]);

    await request(fx.http)
      .patch(`/v1/workspaces/${ws}/members/${adminM.id}`)
      .set(bearer(owner.token))
      .send({ active: true })
      .expect(200);
    await request(fx.http).get(`/v1/workspaces/${ws}/members`).set(bearer(admin.token)).expect(200);
    await request(fx.http)
      .delete(`/v1/workspaces/${ws}/members/${adminM.id}`)
      .set(bearer(owner.token))
      .expect(204);
    await request(fx.http).get(`/v1/workspaces/${ws}/members`).set(bearer(admin.token)).expect(404);
  });

  it('expired (time-boxed) memberships grant nothing', async () => {
    const ws = await fx.workspace();
    const user = await fx.user();
    await fx.member(user.id, ws, 'auditor', { expiresAt: new Date(Date.now() - 1000) });
    const { token, workspaceId } = await fx.login(user.email, PASSWORD, ws);
    expect(workspaceId).toBeNull();
    const me = await request(fx.http).get('/v1/me').set(bearer(token)).expect(200);
    expect(me.body.currentWorkspace).toBeNull();
    expect(me.body.permissions).toEqual([]);
  });

  it('lists members with cursor pagination and role filter', async () => {
    const ws = await fx.workspace();
    const owner = await fx.actor(ws, 'workspace_owner');
    for (let i = 0; i < 3; i++) await fx.member((await fx.user()).id, ws, 'viewer');
    const p1 = await request(fx.http)
      .get(`/v1/workspaces/${ws}/members?limit=2`)
      .set(bearer(owner.token))
      .expect(200);
    expect(p1.body.items).toHaveLength(2);
    const p2 = await request(fx.http)
      .get(`/v1/workspaces/${ws}/members?limit=2&cursor=${p1.body.nextCursor}`)
      .set(bearer(owner.token))
      .expect(200);
    expect(p2.body.items).toHaveLength(2);
    expect(p2.body.nextCursor).toBeNull();
    const viewers = await request(fx.http)
      .get(`/v1/workspaces/${ws}/members?role=viewer`)
      .set(bearer(owner.token))
      .expect(200);
    expect(viewers.body.items).toHaveLength(3);
    await request(fx.http)
      .get(`/v1/workspaces/${ws}/members?limit=1000`)
      .set(bearer(owner.token))
      .expect(400);
  });

  it('bulk CSV invite, user limit and Idempotency-Key replay', async () => {
    const ws = await fx.workspace({ limits: { users: 3 } });
    const owner = await fx.actor(ws, 'workspace_owner');
    const [a, b, c] = [uniqueEmail('csv'), uniqueEmail('csv'), uniqueEmail('csv')];
    const bad = await request(fx.http)
      .post(`/v1/workspaces/${ws}/invitations/csv`)
      .set(bearer(owner.token))
      .send({ csv: `email,role,company_ids,project_ids\n${a},superuser,,\n` })
      .expect(400);
    expect(bad.body.errors).toEqual([{ path: 'csv:2', message: 'role: invalid' }]);

    const csv = `email,role,company_ids,project_ids\n${a},viewer,,\n${b},contributor,,\n`;
    const first = await request(fx.http)
      .post(`/v1/workspaces/${ws}/invitations/csv`)
      .set(bearer(owner.token))
      .set('Idempotency-Key', 'csv-import-0001')
      .send({ csv })
      .expect(201);
    const replay = await request(fx.http)
      .post(`/v1/workspaces/${ws}/invitations/csv`)
      .set(bearer(owner.token))
      .set('Idempotency-Key', 'csv-import-0001')
      .send({ csv })
      .expect(201);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect(replay.body).toEqual(first.body);
    expect(await fx.emailsTo(a)).toHaveLength(1);

    // 1 owner + 2 pending = 3 seats: the next invite exceeds limits.users.
    const over = await request(fx.http)
      .post(`/v1/workspaces/${ws}/invitations`)
      .set(bearer(owner.token))
      .send({ invitations: [{ email: c, role: 'viewer' }] })
      .expect(403);
    expect(over.body).toMatchObject({ type: expect.stringMatching(/limit_exceeded$/), limit: 'users' });
    await request(fx.http)
      .post(`/v1/workspaces/${ws}/invitations`)
      .set(bearer(owner.token))
      .set('Idempotency-Key', 'bad key!')
      .send({ invitations: [{ email: c, role: 'viewer' }] })
      .expect(400);
  });

  it('partner admins manage client workspaces covered by an active grant', async () => {
    const partnerWs = await fx.workspace({ name: 'Partner Co' });
    const clientWs = await fx.workspace({ name: 'Client Co' });
    const otherWs = await fx.workspace({ name: 'Other' });
    const partner = await fx.actor(partnerWs, 'workspace_admin');
    await fx.actor(clientWs, 'workspace_owner');
    const grant = await fx.prisma.partnerGrant.create({
      data: { id: uuidv7(), partnerWorkspaceId: partnerWs, clientWorkspaceId: clientWs, grantedBy: null },
    });

    const me = await request(fx.http).get('/v1/me').set(bearer(partner.token)).expect(200);
    expect(me.body.memberships).toContainEqual({
      workspaceId: clientWs,
      workspaceName: 'Client Co',
      role: 'partner_admin',
      via: 'partner_grant',
    });
    const sw = await request(fx.http)
      .post('/v1/me/workspace')
      .set(bearer(partner.token))
      .send({ workspaceId: clientWs })
      .expect(200);
    const meClient = await request(fx.http).get('/v1/me').set(bearer(sw.body.accessToken)).expect(200);
    expect(meClient.body.currentWorkspace.role).toBe('partner_admin');
    expect(meClient.body.permissions).not.toContain('audit:read');
    await request(fx.http)
      .get(`/v1/workspaces/${clientWs}/members`)
      .set(bearer(sw.body.accessToken))
      .expect(200);
    await request(fx.http)
      .post(`/v1/workspaces/${clientWs}/invitations`)
      .set(bearer(sw.body.accessToken))
      .send({ invitations: [{ email: uniqueEmail('p'), role: 'workspace_owner' }] })
      .expect(403);
    await request(fx.http)
      .post('/v1/me/workspace')
      .set(bearer(partner.token))
      .send({ workspaceId: otherWs })
      .expect(404);

    // Revocation is effective on the next request.
    await fx.prisma.partnerGrant.update({ where: { id: grant.id }, data: { revokedAt: new Date() } });
    await request(fx.http)
      .get(`/v1/workspaces/${clientWs}/members`)
      .set(bearer(sw.body.accessToken))
      .expect(404);
  });
});
