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
        data: { id: uuidv7(), workspaceId: wsA, legalName: 'Acme A Ltd', displayName: 'Acme A' },
      }),
    );
    await prisma.withTenant(wsB, (tx) =>
      tx.company.create({
        data: { id: uuidv7(), workspaceId: wsB, legalName: 'Bravo B Ltd', displayName: 'Bravo B' },
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
          data: { id: uuidv7(), workspaceId: wsB, legalName: 'Sneaky', displayName: 'Sneaky' },
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
