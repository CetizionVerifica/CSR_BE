/**
 * Creates (or promotes) the first platform owner and prints a one-time password-reset link
 * (M01 §7). No credentials in config; nothing is seeded on boot.
 *
 *   npm run seed:owner -- --email you@example.com [--name "Jane Doe"]
 */
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { PrismaPg } from '@prisma/adapter-pg';
import { z } from 'zod';
import { uuidv7 } from '../src/common/ids';
import { PrismaClient } from '../src/generated/prisma/client';
import { expiresAt, hashToken, TTL } from '../src/modules/identity/engine/tokens';

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { email: { type: 'string' }, name: { type: 'string' } } });
  const email = z.string().trim().toLowerCase().pipe(z.email()).parse(values.email);
  const name = values.name?.trim() || email.split('@')[0]!;
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: z.string().min(1).parse(process.env.DATABASE_URL) }),
  });
  try {
    const now = new Date();
    const user = await prisma.user.upsert({
      where: { email },
      create: {
        id: uuidv7(),
        email,
        name,
        status: 'active',
        emailVerifiedAt: now,
        platformRole: 'platform_owner',
      },
      update: { platformRole: 'platform_owner', status: 'active', emailVerifiedAt: now },
    });
    const token = randomBytes(32).toString('base64url');
    await prisma.passwordReset.create({
      data: {
        id: uuidv7(),
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: expiresAt(now, TTL.passwordResetMs),
      },
    });
    await prisma.auditEvent.createMany({
      data: [{ actorType: 'system', action: 'platform.owner.seeded', entityType: 'user', entityId: user.id }],
    });
    const base = (process.env.APP_BASE_URL ?? 'http://localhost:5173').replace(/\/$/, '');
    console.log(`Platform owner ${email} ready. Set a password within 15 minutes (single use):`);
    console.log(`${base}/reset-password/${token}`);
    console.log('MFA enrolment is required at first sign-in.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
