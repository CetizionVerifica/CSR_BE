import { defineConfig } from 'vitest/config';

const testDb =
  process.env.TEST_DATABASE_URL ?? 'postgresql://resilisense:resilisense@localhost:5432/resilisense_test';

/** API e2e tests against a real PostgreSQL (TEST_DATABASE_URL) and Redis. */
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    globalSetup: ['test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'error',
      DATABASE_URL: testDb,
      TEST_DATABASE_URL: testDb,
      REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
      STORAGE_DRIVER: 'local',
      EMAIL_DRIVER: 'log',
      BREACHED_PASSWORD_CHECK: 'off',
    },
  },
});
