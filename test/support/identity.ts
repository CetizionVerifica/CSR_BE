import { type INestApplication } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { type Queue } from 'bullmq';
import { type Redis } from 'ioredis';
import request from 'supertest';
import { type App } from 'supertest/types';
import { type MembershipRoleName, type ModuleName } from '../../src/common/auth/principal';
import { uuidv7 } from '../../src/common/ids';
import { type EmailJob, QUEUES } from '../../src/infra/queue/queues';
import { RATE_LIMIT_PREFIX } from '../../src/infra/rate-limit/rate-limiter';
import { REDIS } from '../../src/infra/redis/redis.module';
import { PrismaService } from '../../src/infra/prisma/prisma.service';
import { PasswordService } from '../../src/modules/identity/password.service';

export const PASSWORD = 'correct horse battery staple';
export const ALL_MODULES: ModuleName[] = [
  'gap',
  'materiality',
  'actions',
  'surveys',
  'supply_chain',
  'ranking',
];

export const uniqueEmail = (tag: string) => `${tag}-${uuidv7()}@example.test`;

/** Test fixtures for identity e2e tests (real PostgreSQL + Redis). */
export class IdentityFixtures {
  readonly prisma: PrismaService;
  readonly http: App;
  private readonly redis: Redis;
  private readonly emailQueue: Queue<EmailJob>;

  constructor(private readonly app: INestApplication<App>) {
    this.prisma = app.get(PrismaService);
    this.http = app.getHttpServer();
    this.redis = app.get(REDIS);
    this.emailQueue = app.get(getQueueToken(QUEUES.email));
  }

  async clearRateLimits(): Promise<void> {
    const keys = await this.redis.keys(`${RATE_LIMIT_PREFIX}*`);
    if (keys.length) await this.redis.del(...keys);
  }

  async user(
    opts: {
      email?: string;
      password?: string | null;
      name?: string;
      platformRole?: 'platform_owner' | 'platform_assessor' | 'platform_support';
      verified?: boolean;
      status?: 'invited' | 'active' | 'disabled';
      passwordHash?: string;
      passwordAlgo?: 'argon2id' | 'bcrypt';
    } = {},
  ) {
    const email = opts.email ?? uniqueEmail('user');
    const password = opts.password === undefined ? PASSWORD : opts.password;
    return this.prisma.user.create({
      data: {
        id: uuidv7(),
        email,
        name: opts.name ?? 'Test User',
        passwordHash:
          opts.passwordHash ?? (password ? await this.app.get(PasswordService).hash(password) : null),
        passwordAlgo: opts.passwordAlgo ?? 'argon2id',
        status: opts.status ?? 'active',
        emailVerifiedAt: opts.verified === false ? null : new Date(),
        platformRole: opts.platformRole ?? null,
      },
    });
  }

  async workspace(opts: { name?: string; modules?: ModuleName[]; limits?: Record<string, number> } = {}) {
    const id = uuidv7();
    await this.prisma.withTenant(id, async (tx) => {
      await tx.workspace.create({ data: { id, name: opts.name ?? `WS ${id.slice(-6)}`, slug: `ws-${id}` } });
      await tx.entitlement.create({
        data: {
          workspaceId: id,
          plan: 'test',
          modules: opts.modules ?? ALL_MODULES,
          limits: opts.limits ?? {},
        },
      });
    });
    return id;
  }

  member(
    userId: string,
    workspaceId: string,
    role: MembershipRoleName,
    extra: { companyIds?: string[]; expiresAt?: Date } = {},
  ) {
    return this.prisma.membership.create({
      data: {
        id: uuidv7(),
        userId,
        workspaceId,
        role,
        companyIds: extra.companyIds ?? [],
        expiresAt: extra.expiresAt ?? null,
      },
    });
  }

  company(workspaceId: string) {
    return this.prisma.withTenant(workspaceId, (tx) =>
      tx.company.create({ data: { id: uuidv7(), workspaceId, legalName: 'Acme Ltd', displayName: 'Acme' } }),
    );
  }

  /** Logs in (no MFA) and returns the bearer token and the refresh cookie. */
  async login(email: string, password = PASSWORD, workspaceId?: string) {
    const res = await request(this.http)
      .post('/v1/auth/login')
      .send({ email, password, ...(workspaceId ? { workspaceId } : {}) })
      .expect(200);
    const body = res.body as { accessToken: string; workspaceId: string | null };
    return {
      token: body.accessToken,
      workspaceId: body.workspaceId,
      cookie: refreshCookie(res.headers['set-cookie']),
    };
  }

  /** User + membership + logged-in token in one step. */
  async actor(workspaceId: string, role: MembershipRoleName, extra: { companyIds?: string[] } = {}) {
    const user = await this.user();
    await this.member(user.id, workspaceId, role, extra);
    const { token } = await this.login(user.email, PASSWORD, workspaceId);
    return { user, token };
  }

  /** Emails queued for an address (BullMQ `email` queue; the worker is not running in tests). */
  async emailsTo(to: string): Promise<EmailJob[]> {
    const jobs = await this.emailQueue.getJobs(['waiting', 'delayed', 'prioritized']);
    return jobs
      .filter((j) => j.data.to.toLowerCase() === to.toLowerCase())
      .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
      .map((j) => j.data);
  }

  /** Token from the last link to `/<path>/<token>` sent to the address. */
  async linkToken(to: string, path: string): Promise<string> {
    const mails = await this.emailsTo(to);
    for (const mail of mails.reverse()) {
      const m = new RegExp(`${path}/([A-Za-z0-9_%-]+)`).exec(mail.text);
      if (m) return decodeURIComponent(m[1]!);
    }
    throw new Error(`no ${path} link sent to ${to}`);
  }

  auditActions(where: { entityId?: string; actorId?: string; workspaceId?: string }) {
    return this.prisma
      .withPlatformScope((tx) => tx.auditEvent.findMany({ where, orderBy: { id: 'asc' } }))
      .then((rows) => rows.map((r) => r.action));
  }
}

export function refreshCookie(setCookie: string | string[] | undefined): string {
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const c = list.find((s) => s.startsWith('rs_refresh='));
  if (!c) throw new Error('no refresh cookie');
  return c.split(';')[0]!;
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
