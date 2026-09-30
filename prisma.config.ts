import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Prisma CLI config (Prisma 7). The app itself reads env through src/config.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node -r @swc-node/register prisma/seed/index.ts',
  },
  datasource: {
    // Owner role: runs migrations. The API connects with the same non-superuser role;
    // tenant tables use FORCE ROW LEVEL SECURITY so the owner is still subject to RLS.
    url: process.env.DATABASE_URL ?? '',
  },
});
