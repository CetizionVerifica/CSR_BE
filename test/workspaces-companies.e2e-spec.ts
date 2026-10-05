import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { type App } from 'supertest/types';
import { base32Decode, totp } from '../src/modules/identity/engine/totp';
import { createTestApp } from './app';
import { bearer, IdentityFixtures, PASSWORD, uniqueEmail } from './support/identity';

const newCompany = (over: Record<string, unknown> = {}) => ({
  legalName: 'Acme Industries Ltd',
  displayName: 'Acme',
  sectorCode: 'chemicalIndustry',
  sizeBand: 'medium',
  country: 'DE',
  currency: 'EUR',
  ...over,
});

/** M02 §5 (US-02-1, -2, -4, -5), §7 rules, §8 routes, tenancy (404). */
describe('workspaces & companies (e2e)', () => {
  let app: INestApplication<App>;
  let fx: IdentityFixtures;

  beforeAll(async () => {
    app = await createTestApp();
    fx = new IdentityFixtures(app);
  });
  afterAll(() => app.close());
  beforeEach(() => fx.clearRateLimits());

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
      .send({ code: totp(base32Decode(setup.body.secret as string), Date.now()) })
      .expect(200);
    return { user, token: confirm.body.session.accessToken as string };
  }

  it('reference lists: 47 sectors and 249 countries, cacheable, signed-in only', async () => {
    const ws = await fx.workspace();
    const viewer = await fx.actor(ws, 'viewer');
    await request(fx.http).get('/v1/reference/sectors').expect(401);
    const sectors = await request(fx.http).get('/v1/reference/sectors').set(bearer(viewer.token)).expect(200);
    expect(sectors.body.items).toHaveLength(47);
    expect(sectors.headers['cache-control']).toBe('private, max-age=86400');
    expect(sectors.body.items).toContainEqual(
      expect.objectContaining({ code: 'chemicalIndustry', parentCode: 'secondarySectorManufacturing' }),
    );
    const countries = await request(fx.http)
      .get('/v1/reference/countries')
      .set(bearer(viewer.token))
      .expect(200);
    expect(countries.body.items).toHaveLength(249);
    expect(countries.body.items).toContainEqual({ code: 'IN', region: 'asia', labelKey: 'country.IN' });
  });

  it('US-02-4: admin creates companies within the limit; viewers read; validation; tenancy 404', async () => {
    const ws = await fx.workspace({ limits: { companies: 2 } });
    const admin = await fx.actor(ws, 'workspace_admin');
    const viewer = await fx.actor(ws, 'viewer');

    await request(fx.http).post('/v1/companies').set(bearer(viewer.token)).send(newCompany()).expect(403);
    const bad = await request(fx.http)
      .post('/v1/companies')
      .set(bearer(admin.token))
      .send(newCompany({ sectorCode: 'nope' }))
      .expect(400);
    expect(bad.body.errors).toEqual([{ path: 'sectorCode', message: 'Unknown sector' }]);
    await request(fx.http)
      .post('/v1/companies')
      .set(bearer(admin.token))
      .send(newCompany({ currency: 'XYZ' }))
      .expect(400);
    await request(fx.http)
      .post('/v1/companies')
      .set(bearer(admin.token))
      .send(newCompany({ password: 'x' }))
      .expect(400);

    const parent = await request(fx.http)
      .post('/v1/companies')
      .set(bearer(admin.token))
      .send(newCompany())
      .expect(201);
    expect(parent.body).toMatchObject({ displayName: 'Acme', fiscalYearStartMonth: 1, deletedAt: null });
    const sub = await request(fx.http)
      .post('/v1/companies')
      .set(bearer(admin.token))
      .send(
        newCompany({
          legalName: 'Acme India Pvt Ltd',
          displayName: undefined,
          country: 'IN',
          currency: 'INR',
          parentCompanyId: parent.body.id,
        }),
      )
      .expect(201);
    expect(sub.body).toMatchObject({ displayName: 'Acme India Pvt Ltd', parentCompanyId: parent.body.id });

    const limit = await request(fx.http)
      .post('/v1/companies')
      .set(bearer(admin.token))
      .send(newCompany())
      .expect(403);
    expect(limit.body).toMatchObject({
      type: 'https://resilisense.org/problems/limit_exceeded',
      limit: 'companies',
      max: 2,
    });

    const list = await request(fx.http).get('/v1/companies?q=india').set(bearer(viewer.token)).expect(200);
    expect(list.body.items.map((c: { id: string }) => c.id)).toEqual([sub.body.id]);
    expect(list.body.items[0].lastActivityAt).toEqual(expect.any(String));

    // A parent cannot become its own descendant.
    await request(fx.http)
      .patch(`/v1/companies/${parent.body.id}`)
      .set(bearer(admin.token))
      .send({ parentCompanyId: sub.body.id })
      .expect(400);

    // Another workspace never sees these companies.
    const other = await fx.workspace();
    const outsider = await fx.actor(other, 'workspace_owner');
    await request(fx.http).get(`/v1/companies/${parent.body.id}`).set(bearer(outsider.token)).expect(404);
    await request(fx.http)
      .patch(`/v1/companies/${parent.body.id}`)
      .set(bearer(outsider.token))
      .send({ displayName: 'X' })
      .expect(404);
    const otherList = await request(fx.http).get('/v1/companies').set(bearer(outsider.token)).expect(200);
    expect(otherList.body.items).toEqual([]);
  });

  it('contributors limited to a company only see that company', async () => {
    const ws = await fx.workspace();
    const a = await fx.company(ws);
    const b = await fx.company(ws);
    const contributor = await fx.actor(ws, 'contributor', { companyIds: [a.id] });
    const list = await request(fx.http).get('/v1/companies').set(bearer(contributor.token)).expect(200);
    expect(list.body.items.map((c: { id: string }) => c.id)).toEqual([a.id]);
    await request(fx.http).get(`/v1/companies/${b.id}`).set(bearer(contributor.token)).expect(404);
    await request(fx.http)
      .patch(`/v1/companies/${a.id}`)
      .set(bearer(contributor.token))
      .send({ displayName: 'X' })
      .expect(403);
  });

  it('M02 §7: delete needs the typed name, is restorable, and the activity feed records it all', async () => {
    const ws = await fx.workspace({ limits: { companies: 1 } });
    const admin = await fx.actor(ws, 'workspace_admin');
    const created = await request(fx.http)
      .post('/v1/companies')
      .set(bearer(admin.token))
      .send(newCompany())
      .expect(201);
    const id = created.body.id as string;
    await request(fx.http)
      .patch(`/v1/companies/${id}`)
      .set(bearer(admin.token))
      .send({ employeeCount: 120, address: { city: 'Berlin' } })
      .expect(200);

    await request(fx.http).delete(`/v1/companies/${id}`).set(bearer(admin.token)).expect(400);
    await request(fx.http).delete(`/v1/companies/${id}?confirmName=Acm`).set(bearer(admin.token)).expect(400);
    const deleted = await request(fx.http)
      .delete(`/v1/companies/${id}?confirmName=acme`)
      .set(bearer(admin.token))
      .expect(200);
    expect(deleted.body.restorableUntil).toEqual(expect.any(String));
    await request(fx.http).get(`/v1/companies/${id}`).set(bearer(admin.token)).expect(404);

    const trash = await request(fx.http)
      .get('/v1/companies?status=deleted')
      .set(bearer(admin.token))
      .expect(200);
    expect(trash.body.items.map((c: { id: string }) => c.id)).toEqual([id]);
    const viewer = await fx.actor(ws, 'viewer');
    await request(fx.http).get('/v1/companies?status=deleted').set(bearer(viewer.token)).expect(403);

    // The slot is free again while deleted; restoring past the limit is refused.
    const second = await request(fx.http)
      .post('/v1/companies')
      .set(bearer(admin.token))
      .send(newCompany({ legalName: 'Other' }))
      .expect(201);
    await request(fx.http).post(`/v1/companies/${id}/restore`).set(bearer(admin.token)).expect(403);
    await request(fx.http)
      .delete(`/v1/companies/${second.body.id}?confirmName=Acme`)
      .set(bearer(admin.token))
      .expect(200);
    await request(fx.http).post(`/v1/companies/${id}/restore`).set(bearer(admin.token)).expect(200);

    // Past the 30-day window the company can no longer be restored.
    await fx.prisma.withTenant(ws, (tx) =>
      tx.company.update({
        where: { id: second.body.id },
        data: { deletedAt: new Date(Date.now() - 31 * 24 * 3600_000) },
      }),
    );
    await request(fx.http)
      .post(`/v1/companies/${second.body.id}/restore`)
      .set(bearer(admin.token))
      .expect(404);

    const activity = await request(fx.http)
      .get(`/v1/companies/${id}/activity?limit=10`)
      .set(bearer(viewer.token))
      .expect(200);
    expect(activity.body.items.map((e: { action: string }) => e.action)).toEqual([
      'company.restored',
      'company.deleted',
      'company.updated',
      'company.created',
    ]);
    expect(activity.body.items[2]).toMatchObject({
      fields: ['employeeCount', 'address'],
      actor: { id: admin.user.id, name: 'Test User' },
    });
    const paged = await request(fx.http)
      .get(`/v1/companies/${id}/activity?limit=2`)
      .set(bearer(viewer.token))
      .expect(200);
    const rest = await request(fx.http)
      .get(`/v1/companies/${id}/activity?limit=2&cursor=${paged.body.nextCursor as string}`)
      .set(bearer(viewer.token))
      .expect(200);
    expect(rest.body.items.map((e: { action: string }) => e.action)).toEqual([
      'company.updated',
      'company.created',
    ]);
  });

  it('workspace profile is owner-managed; entitlements show usage vs limits', async () => {
    const ws = await fx.workspace({ modules: ['gap'], limits: { companies: 3, users: 10 } });
    const owner = await fx.actor(ws, 'workspace_owner');
    const admin = await fx.actor(ws, 'workspace_admin');
    await fx.company(ws);

    const cur = await request(fx.http).get('/v1/workspaces/current').set(bearer(admin.token)).expect(200);
    expect(cur.body).toMatchObject({ id: ws, dataRegion: 'eu', createdVia: 'platform', branding: {} });
    await request(fx.http)
      .patch('/v1/workspaces/current')
      .set(bearer(admin.token))
      .send({ name: 'X' })
      .expect(403);
    await request(fx.http)
      .patch('/v1/workspaces/current')
      .set(bearer(owner.token))
      .send({ dataRegion: 'us' })
      .expect(400);
    const upd = await request(fx.http)
      .patch('/v1/workspaces/current')
      .set(bearer(owner.token))
      .send({
        name: 'Renamed',
        country: 'FR',
        timezone: 'Europe/Paris',
        branding: { accentColor: '#D8882A' },
      })
      .expect(200);
    expect(upd.body).toMatchObject({
      name: 'Renamed',
      country: 'FR',
      timezone: 'Europe/Paris',
      branding: { accentColor: '#D8882A' },
    });

    const ent = await request(fx.http)
      .get('/v1/workspaces/current/entitlements')
      .set(bearer(admin.token))
      .expect(200);
    expect(ent.body).toEqual({
      plan: 'test',
      modules: ['gap'],
      limits: { companies: 3, users: 10 },
      trialEndsAt: null,
      usage: { companies: 1, users: 2, clientWorkspaces: 0 },
    });
  });

  it('US-02-1 / US-02-2: partner onboards a client within its quota; the owner revokes the partner', async () => {
    const partner = await fx.workspace({
      name: 'Consult Co',
      modules: ['gap', 'materiality'],
      limits: { clientWorkspaces: 1 },
    });
    const partnerAdmin = await fx.actor(partner, 'workspace_admin');
    const plain = await fx.workspace();
    const plainAdmin = await fx.actor(plain, 'workspace_admin');
    const ownerEmail = uniqueEmail('client-owner');
    const body = {
      workspace: { name: 'Client One', country: 'IN' },
      company: newCompany({ country: 'IN', currency: 'INR' }),
      owner: { email: ownerEmail },
    };

    await request(fx.http).post('/v1/partner/clients').set(bearer(plainAdmin.token)).send(body).expect(403);
    const viewer = await fx.actor(partner, 'viewer');
    await request(fx.http).post('/v1/partner/clients').set(bearer(viewer.token)).send(body).expect(403);

    const created = await request(fx.http)
      .post('/v1/partner/clients')
      .set(bearer(partnerAdmin.token))
      .send(body)
      .expect(201);
    const client = created.body.workspaceId as string;
    const second = await request(fx.http)
      .post('/v1/partner/clients')
      .set(bearer(partnerAdmin.token))
      .send({ ...body, owner: { email: uniqueEmail('x') } })
      .expect(403);
    expect(second.body).toMatchObject({ limit: 'clientWorkspaces' });

    const list = await request(fx.http)
      .get('/v1/partner/clients')
      .set(bearer(partnerAdmin.token))
      .expect(200);
    expect(list.body).toMatchObject({
      items: [{ workspaceId: client, name: 'Client One', status: 'active', companies: 1 }],
      usage: { clientWorkspaces: 1, limit: 1 },
    });
    expect(await fx.auditActions({ workspaceId: client })).toEqual(
      expect.arrayContaining([
        'workspace.created',
        'partner_grant.created',
        'company.created',
        'user.invited',
      ]),
    );

    // The partner sees the client in the switcher and acts there as partner_admin.
    const me = await request(fx.http).get('/v1/me').set(bearer(partnerAdmin.token)).expect(200);
    expect(me.body.memberships).toContainEqual({
      workspaceId: client,
      workspaceName: 'Client One',
      role: 'partner_admin',
      via: 'partner_grant',
    });
    const sw = await request(fx.http)
      .post('/v1/me/workspace')
      .set(bearer(partnerAdmin.token))
      .send({ workspaceId: client })
      .expect(200);
    const asPartner = sw.body.accessToken as string;
    await request(fx.http).get('/v1/companies').set(bearer(asPartner)).expect(200);

    // The invited owner accepts; client entitlements follow the partner's modules.
    const token = await fx.linkToken(ownerEmail, 'accept-invite');
    await request(fx.http)
      .post('/v1/invitations/accept')
      .send({ token, name: 'Olga Owner', password: PASSWORD })
      .expect(200);
    const owner = await fx.login(ownerEmail, PASSWORD, client);
    const ent = await request(fx.http)
      .get('/v1/workspaces/current/entitlements')
      .set(bearer(owner.token))
      .expect(200);
    expect(ent.body).toMatchObject({
      plan: 'partner_client',
      modules: ['gap', 'materiality'],
      limits: { companies: 1, users: 5 },
    });

    const grants = await request(fx.http)
      .get('/v1/workspaces/current/partner-grants')
      .set(bearer(owner.token))
      .expect(200);
    expect(grants.body.items).toEqual([
      expect.objectContaining({ partnerWorkspaceId: partner, partnerName: 'Consult Co' }),
    ]);
    await request(fx.http)
      .delete(`/v1/workspaces/current/partner-grants/${grants.body.items[0].id as string}`)
      .set(bearer(asPartner))
      .expect(403);
    await request(fx.http)
      .delete(`/v1/workspaces/current/partner-grants/${grants.body.items[0].id as string}`)
      .set(bearer(owner.token))
      .expect(204);

    // Effective on the partner's next request; the partner's admins are told.
    const after = await request(fx.http).get('/v1/companies').set(bearer(asPartner));
    expect(after.status).toBe(403);
    await request(fx.http)
      .post('/v1/me/workspace')
      .set(bearer(partnerAdmin.token))
      .send({ workspaceId: client })
      .expect(404);
    expect((await fx.emailsTo(partnerAdmin.user.email)).map((m) => m.subject)).toContain(
      'Client One revoked your partner access',
    );
    const list2 = await request(fx.http)
      .get('/v1/partner/clients')
      .set(bearer(partnerAdmin.token))
      .expect(200);
    expect(list2.body.items).toEqual([]);
  });

  it('US-02-5: platform owner lists, suspends (read-only) and sets entitlements; audited', async () => {
    const ws = await fx.workspace({ name: 'Suspend Me', modules: ['gap'] });
    const admin = await fx.actor(ws, 'workspace_admin');
    const po = await platformOwner();
    await request(fx.http).get('/v1/platform/workspaces').set(bearer(admin.token)).expect(403);

    const list = await request(fx.http)
      .get('/v1/platform/workspaces?q=Suspend%20Me')
      .set(bearer(po.token))
      .expect(200);
    expect(list.body.items).toContainEqual(
      expect.objectContaining({ id: ws, plan: 'test', modules: ['gap'], members: 1, companies: 0 }),
    );

    await request(fx.http)
      .patch(`/v1/platform/workspaces/${ws}`)
      .set(bearer(po.token))
      .send({ status: 'suspended' })
      .expect(200);
    const blocked = await request(fx.http)
      .post('/v1/companies')
      .set(bearer(admin.token))
      .send(newCompany())
      .expect(403);
    expect(blocked.body.type).toBe('https://resilisense.org/problems/workspace_suspended');
    await request(fx.http).get('/v1/companies').set(bearer(admin.token)).expect(200);
    const me = await request(fx.http).get('/v1/me').set(bearer(admin.token)).expect(200);
    expect(me.body.currentWorkspace.status).toBe('suspended');
    await request(fx.http)
      .patch(`/v1/platform/workspaces/${ws}`)
      .set(bearer(po.token))
      .send({ status: 'active' })
      .expect(200);
    await request(fx.http).post('/v1/companies').set(bearer(admin.token)).send(newCompany()).expect(201);

    const put = await request(fx.http)
      .put(`/v1/platform/workspaces/${ws}/entitlements`)
      .set(bearer(po.token))
      .send({
        plan: 'professional',
        modules: ['gap', 'materiality', 'gap'],
        limits: { companies: 5, users: null },
      })
      .expect(200);
    expect(put.body).toEqual({
      plan: 'professional',
      modules: ['gap', 'materiality'],
      limits: { companies: 5 },
    });
    await request(fx.http)
      .put(`/v1/platform/workspaces/${ws}/entitlements`)
      .set(bearer(po.token))
      .send({ plan: 'x', modules: ['nope'], limits: {} })
      .expect(400);
    expect(await fx.auditActions({ workspaceId: ws, actorId: po.user.id })).toEqual([
      'workspace.suspended',
      'workspace.updated',
      'entitlements.changed',
    ]);
  });
});
