import { defineConfig } from 'vitest/config';

/** Unit tests: engines, services, adapters (no database). */
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts', 'prisma/**/*.spec.ts', 'scripts/**/*.spec.ts', 'scripts/**/*.test.mjs'],
    coverage: {
      include: ['src/**/*.ts'],
      exclude: ['src/generated/**', 'src/main.ts', 'src/worker.ts', 'src/**/*.spec.ts'],
      reportsDirectory: 'coverage/unit',
      // CI test plan B3: engines are pure and fully specified, so they stay (almost) fully covered.
      // Floors only ratchet up; services/controllers/repositories are covered by the e2e run.
      thresholds: {
        'src/modules/*/engine/**/*.ts': { lines: 100, functions: 100, statements: 95, branches: 95 },
      },
    },
  },
});
