import { type INestApplication } from '@nestjs/common';
import { uuidv7 } from '../src/common/ids';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { createTestApp } from './app';

/** ADR-003: tenant tables are isolated by PostgreSQL row-level security, deny by default. */
describe('tenancy — row-level security (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const wsA = uuidv7();
  const wsB = uuidv7();

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await prisma.workspace.createMany({
      data: [
        { id: wsA, name: 'Workspace A', slug: `a-${wsA}` },
        { id: wsB, name: 'Workspace B', slug: `b-${wsB}` },
      ],
    });
    await prisma.withTenant(wsA, (tx) =>
      tx.company.create({
        data: {
          id: uuidv7(),
          workspaceId: wsA,
          legalName: 'Acme A Ltd',
          displayName: 'Acme A',
          currency: 'EUR',
        },
      }),
    );
    await prisma.withTenant(wsB, (tx) =>
      tx.company.create({
        data: {
          id: uuidv7(),
          workspaceId: wsB,
          legalName: 'Bravo B Ltd',
          displayName: 'Bravo B',
          currency: 'EUR',
        },
      }),
    );
  });

  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: { in: [wsA, wsB] } } });
    await app.close();
  });

  it('a workspace sees only its own rows', async () => {
    const a = await prisma.withTenant(wsA, (tx) => tx.company.findMany());
    const b = await prisma.withTenant(wsB, (tx) => tx.company.findMany());
    expect(a.map((c) => c.displayName)).toEqual(['Acme A']);
    expect(b.map((c) => c.displayName)).toEqual(['Bravo B']);
  });

  it('without a tenant context nothing is visible', async () => {
    expect(await prisma.company.findMany({ where: { workspaceId: { in: [wsA, wsB] } } })).toEqual([]);
  });

  it('cannot write rows into another workspace', async () => {
    await expect(
      prisma.withTenant(wsA, (tx) =>
        tx.company.create({
          data: {
            id: uuidv7(),
            workspaceId: wsB,
            legalName: 'Sneaky',
            displayName: 'Sneaky',
            currency: 'EUR',
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it('cannot read another workspace by id', async () => {
    const [bCompany] = await prisma.withTenant(wsB, (tx) => tx.company.findMany());
    const found = await prisma.withTenant(wsA, (tx) =>
      tx.company.findUnique({ where: { id: bCompany!.id } }),
    );
    expect(found).toBeNull();
  });

  it('the setting does not leak outside the transaction', async () => {
    await prisma.withTenant(wsA, (tx) => tx.company.findMany());
    expect(await prisma.company.count({ where: { workspaceId: wsA } })).toBe(0);
  });

  it('rejects a non-UUID workspace id', async () => {
    await expect(prisma.withTenant("x' OR '1'='1", (tx) => tx.company.findMany())).rejects.toThrow(/UUID/);
  });
});

/** M01 tenant tables: invitations and entitlements are RLS-isolated; audit_events is append-only. */
describe('tenancy — identity tables (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const wsA = uuidv7();
  const wsB = uuidv7();

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const inviter = uuidv7();
    for (const ws of [wsA, wsB]) {
      await prisma.withTenant(ws, async (tx) => {
        await tx.workspace.create({ data: { id: ws, name: ws, slug: `s-${ws}` } });
        await tx.entitlement.create({ data: { workspaceId: ws, plan: 'p', modules: ['gap'] } });
        await tx.invitation.create({
          data: {
            id: uuidv7(),
            workspaceId: ws,
            email: `${ws}@example.test`,
            role: 'viewer',
            tokenHash: `h-${ws}`,
            expiresAt: new Date(Date.now() + 3600_000),
            invitedBy: inviter,
          },
        });
        await tx.auditEvent.createMany({
          data: [{ workspaceId: ws, actorType: 'system', action: 'test.event', entityType: 'test' }],
        });
      });
    }
  });

  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: { in: [wsA, wsB] } } });
    await app.close();
  });

  it('invitations and entitlements are visible only inside their workspace', async () => {
    const inv = await prisma.withTenant(wsA, (tx) => tx.invitation.findMany());
    expect(inv.map((i) => i.workspaceId)).toEqual([wsA]);
    expect(
      await prisma.withTenant(wsA, (tx) => tx.entitlement.findUnique({ where: { workspaceId: wsB } })),
    ).toBeNull();
    expect(await prisma.invitation.count()).toBe(0);
    expect(await prisma.entitlement.count()).toBe(0);
    await expect(
      prisma.withTenant(wsA, (tx) => tx.invitation.findUnique({ where: { tokenHash: `h-${wsB}` } })),
    ).resolves.toBeNull();
  });

  it('audit events: readable per workspace or in the platform scope, never updated or deleted', async () => {
    const a = await prisma.withTenant(wsA, (tx) =>
      tx.auditEvent.findMany({ where: { action: 'test.event' } }),
    );
    expect(a.map((e) => e.workspaceId)).toEqual([wsA]);
    expect(await prisma.auditEvent.count({ where: { workspaceId: { in: [wsA, wsB] } } })).toBe(0);
    const all = await prisma.withPlatformScope((tx) =>
      tx.auditEvent.count({ where: { workspaceId: { in: [wsA, wsB] } } }),
    );
    expect(all).toBe(2);
    const updated = await prisma.withTenant(wsA, (tx) =>
      tx.auditEvent.updateMany({ where: { workspaceId: wsA }, data: { action: 'tampered' } }),
    );
    expect(updated.count).toBe(0);
    const deleted = await prisma.withPlatformScope((tx) =>
      tx.auditEvent.deleteMany({ where: { workspaceId: wsA } }),
    );
    expect(deleted.count).toBe(0);
  });
});
