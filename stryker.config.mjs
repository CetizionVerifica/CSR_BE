// @ts-check
/**
 * Mutation testing of the pure engines (CI test plan B5): Stryker changes engine code (flips
 * conditions, boundaries, constants) and checks a unit test fails for each change. A surviving
 * mutant is an edge case no test pins down. Runs nightly (.github/workflows/mutation.yml):
 * `npm run test:mutation`, report in reports/mutation/.
 *
 * Uses the command runner (runs the engine specs once per mutant): @stryker-mutator/vitest-runner
 * 10 doesn't activate mutants under Vitest 5, so every mutant "survived". Engines are small and
 * pure; the full run takes about 15 minutes on 4 cores.
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  testRunner: 'command',
  commandRunner: { command: 'npx vitest run --reporter=dot /engine/' },
  mutate: ['src/modules/*/engine/**/*.ts', '!src/modules/*/engine/**/*.spec.ts'],
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/index.html' },
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  // Baseline 2026-10-05: 90.0% (538/598 killed). `break` fails the nightly below it; only raise it.
  thresholds: { high: 90, low: 75, break: 85 },
  coverageAnalysis: 'off',
  concurrency: 4,
  timeoutMS: 60_000,
};
