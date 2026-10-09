---
name: build-module
description: Build one ResiliSense module in the current repo (CSR_BE backend or Resilisense-FE frontend) against its contract, independently of other unfinished modules, then open a PR. Use for "/build-module supplier-register", "implement M02", or any request to implement a module or a due diligence feature from its spec.
argument-hint: <module folder or spec id, e.g. supplier-register | M10> [notes]
---

# Build module

Implements one module end to end in this repo, against the contract written by `/module-contract`. Identical in both repos: the backend and frontend paths below are chosen by which repo you are in (`nest-cli.json` present → backend; `vite.config.ts` present → frontend).

## Before writing code

1. Read the CLAUDE.md chain top-down: root `CLAUDE.md` → layer file (`src/modules/CLAUDE.md` or `src/features/CLAUDE.md`) → module card (`src/modules|features/<folder>/CLAUDE.md`). Then the spec end to end, `docs/revamp/06-modular-build.md` §3–§4, and for the frontend `docs/revamp/02-design-system.md` §5, §6 and §9 (Calm Ledger).
2. **Gate.** Stop and report, without coding, if: the spec status is not `Ready`; spec §14 or the module card is missing (run `/module-contract` first); the contract contradicts the spec; or something needed is ambiguous. Propose the spec change instead of guessing.
3. **Dependencies.** For each module in "Depends on": if it is built, read its `index.ts` and use only what it exports; if it is not, plan a fake (backend `src/modules/<folder>/__tests__/fakes/<dep>.fake.ts`) or MSW handlers (frontend `src/features/<folder>/mocks.ts`) that implement exactly the contract in its spec §14.
4. **Plan** (wait for approval when interactive): files to add, tables + migrations + RLS (backend), routes + permissions, engine functions, events, pages and components (frontend), tests per user story, and the one-line registrations in the composition roots.

## Backend (CSR_BE)

1. Schema section for the module in `prisma/schema.prisma` + migration + `_rls_<folder>_tables` migration (`prisma/CLAUDE.md`).
2. `engine/` first: pure functions with table-driven tests for every edge case in the spec and `*.property.spec.ts` (fast-check).
3. `dto/` + controller signatures with `@Can`/`@Authenticated`/`@Public` and `@ApiZod*`; regenerate `openapi.json` early so the frontend can sync.
4. Repository (only Prisma access), services (transactions via `withTenant`, `AuditService.record`, events), processors in `src/worker.ts` for side effects.
5. `index.ts` exporting exactly the contract's public surface; register the module in `src/app.module.ts`; add permissions to `common/auth/decorators.ts` + the M01 matrix and the entitlement if the spec names one.
6. E2e `test/<folder>-*.e2e-spec.ts`: happy path, forbidden role, other workspace → 404, invalid transition, every story id in a test title; extend `tenancy-rls`, `route-authorization` and `route-access-matrix` suites. Add the spec id to `spec-coverage.json`.

## Frontend (Resilisense-FE)

1. `npm run api:sync` (against the backend PR's `openapi.json` if it is not merged yet; note that in the PR). Missing endpoint → stop and describe the backend change.
2. `routes.tsx` (lazy pages), one spread in `src/app/router.tsx`, one entry in `src/app/shell/nav.ts` (Supply chain group for due diligence), namespace `src/locales/en/<folder>.json`.
3. Pages with skeleton, empty and error states; URL-synced filters and tabs; permission and entitlement guards.
4. Components per the card: shared ones in `src/components/ui` or `src/components/charts` (with stories), the rest in the feature. Calm Ledger: tokens only, logical utilities, entrance once per view, reduced motion, charts through `ResiliChart` with table view.
5. `mocks.ts` handlers + one spread in `src/mocks/handlers.ts`; MSW page tests, component tests (keyboard + accessible names), Playwright journey `e2e/<folder>.spec.ts` with axe; story ids in test titles; add the spec id to `spec-coverage.json`.
6. `index.ts` exporting only what other features need (often nothing).

## Finish

1. Run everything: `npm run lint && npm run typecheck && npm test`, plus `npm run test:e2e` and `npm run spec:coverage` (and `npm run build`, `npm run i18n:check` on the frontend). Fix until green.
2. Update the module card: status, public surface table, components and behaviour as built, tests. Update spec status to `In progress` (mirror `docs/revamp` to the sibling repo, or say in the PR that it is needed).
3. Run `/check-module <folder>` and fix what it reports.
4. Commit with Conventional Commits (`feat(<folder>): …`), push, open a PR whose body maps changes to spec sections ("Implements M10 §4.1, §8") and, for the frontend, has light, dark and RTL screenshots of the main screens.
