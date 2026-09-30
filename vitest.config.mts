import { defineConfig } from 'vitest/config';

/** Unit tests: engines, services, adapters (no database). */
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts', 'prisma/**/*.spec.ts', 'scripts/**/*.spec.ts'],
    coverage: { include: ['src/**/*.ts'], exclude: ['src/generated/**', 'src/main.ts', 'src/worker.ts'] },
  },
});
