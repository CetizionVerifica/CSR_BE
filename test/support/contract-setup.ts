import { drainContractViolations } from './contract';

/** Fails the test whose requests got a response the OpenAPI contract does not describe (see contract.ts). */
afterEach(() => {
  const violations = drainContractViolations();
  if (violations.length === 0) return;
  const lines = violations.map((v) => `  ${v.request} → ${v.status}: ${v.problem}`);
  throw new Error(`Responses that break the OpenAPI contract:\n${lines.join('\n')}`);
});
