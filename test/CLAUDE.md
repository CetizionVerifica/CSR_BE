# test — API end-to-end tests (layer rules)

Level 1 (`docs/revamp/06-modular-build.md` §2). Vitest + supertest against real PostgreSQL and Redis (`TEST_DATABASE_URL`); unit tests live next to the code (`*.spec.ts`).

- **One file per module area**: `test/<module>-<area>.e2e-spec.ts`. A module's e2e tests seed only kernel data (workspaces, companies, users) through `test/support/` helpers and its own API; they never insert rows into another module's tables. Dependencies that are not built yet are replaced by the module's fakes (`src/modules/<module>/__tests__/fakes/`) via Nest provider overrides.
- **Every module covers**: happy path, forbidden role, another workspace's ids answer 404, invalid state transition, and the stories of its spec (`'US-xx-y: …'` in the test title; `npm run spec:coverage`).
- **Contract**: every response is checked against the OpenAPI document (`test/support/contract.ts`); document every status a route returns and keep errors problem+json with a known `type`.
- **Shared suites to extend** when a module adds routes or tables: `route-authorization.e2e-spec.ts` (every route decorated), `route-access-matrix.e2e-spec.ts` (role × route), `tenancy-rls.e2e-spec.ts` (new tenant tables), `input-hardening.e2e-spec.ts`.
- Coverage floors in `vitest.config.e2e.mts` only go up.
