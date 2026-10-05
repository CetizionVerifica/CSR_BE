/**
 * API fuzzing target (CI test plan B4). Boots the real app (as the e2e tests do) on FUZZ_PORT,
 * creates a workspace owner with every module, and writes their bearer token to FUZZ_TOKEN_FILE
 * so Schemathesis can call authenticated routes. Run with the e2e env (test database + Redis):
 *
 *   npm run fuzz:serve &   # then: st run openapi.json --url http://localhost:4010 -H "Authorization: Bearer $(cat …)"
 */
import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { createTestApp } from '../app';
import { ALL_MODULES, IdentityFixtures } from '../support/identity';

async function main(): Promise<void> {
  const app = await createTestApp();
  const fx = new IdentityFixtures(app);
  const ws = await fx.workspace({ name: 'Fuzz workspace', modules: ALL_MODULES });
  const { token } = await fx.actor(ws, 'workspace_owner');
  const port = Number(process.env.FUZZ_PORT ?? 4010);
  await app.listen(port);
  writeFileSync(process.env.FUZZ_TOKEN_FILE ?? 'fuzz-token.txt', token);
  console.log(`fuzz target listening on http://localhost:${port} (workspace ${ws})`);
}

void main();
