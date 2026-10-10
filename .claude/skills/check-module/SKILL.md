---
name: check-module
description: Audit one ResiliSense module (or all) for loose coupling and spec conformance — import boundaries, contract vs index.ts, module card freshness, spec coverage, docs mirror between the two repos and, in the frontend, Calm Ledger UI rules. Use before opening a module PR, after a dependency lands, or when asked to "check", "audit" or "verify" a module.
argument-hint: '[module folder | all] [--fix]'
---

# Check module

Read-only by default; with `--fix`, applies the fixes that are mechanical and reports the rest. Identical in both repos.

## Checks

Run each check for the module given (or every folder under `src/modules` / `src/features` for `all`) and collect findings as `| check | file:line | finding | fix |`.

1. **Boundaries** — run `npm run lint` and keep the `resilisense/module-boundaries` findings. Also search for relative imports that leave the module and come back in (`../../modules/x/...`) in tests, and for raw SQL or Prisma calls naming another module's tables (backend).
2. **Contract vs code** — compare the spec §14 "Public surface" and the card's table with the module's `index.ts` exports: missing exports, exports nobody declared, and consumers importing something not in the contract (`grep -rn "from '../<folder>'"` / `"@/features/<folder>'"`).
3. **Fakes and mocks** — backend fakes in `__tests__/fakes/` implement only methods that exist on the real exported service (once it exists) with the same signatures; frontend `mocks.ts` handlers only cover routes present in `api/openapi.json`.
4. **Module card** — the card exists, has the nine headings of `06-modular-build.md` §2.1, its status matches the spec, and every file, route, table, permission and event it names exists (or is marked planned). Layer files and the root `CLAUDE.md` are not contradicted.
5. **Spec coverage** — `npm run spec:coverage`; the module is listed in `spec-coverage.json` once implemented; every story id of its spec appears in a test title.
6. **Registration** — exactly one entry in the composition roots (`src/app.module.ts`/`src/worker.ts`, or `src/app/router.tsx`/`src/app/shell/nav.ts`/`src/mocks/handlers.ts`), and the nav entry has a permission (and module entitlement when the spec has one).
7. **Docs and playbook mirror** — if the sibling repo is next to this one, `diff -r docs/revamp ../<sibling>/docs/revamp` and `diff -r .claude/skills ../<sibling>/.claude/skills` must be empty, and so must the diff of `scripts/plan-status*.mjs` and `scripts/module-boundaries*.mjs`; the sibling has a card for the module if the module exists there. Every folder in `06-modular-build.md` §5 has an entry in `docs/revamp/plan.json` with the same wave, and `npm run plan:status` reports the module's step consistently with its spec status and folders.
8. **Backend rules** — every route decorated, tenant tables have RLS migrations and an isolation test, scores only in `engine/`, `openapi.json` regenerated (`npm run openapi` leaves no diff).
9. **Frontend Calm Ledger rules** (`02` §9) — no hex or inline colour/spacing styles in the module, no physical direction utilities, no `setInterval`/CSS animation that runs forever, entrance animations guarded by reduced motion, charts through `ResiliChart` with a table view, every async page has skeleton, empty and error states, every string through `t()`.

## Output

A findings table sorted by severity (boundary and contract breaks first), a one-line verdict ("independent and conformant" or what blocks it), and with `--fix` the list of fixes applied. When the module has an open PR, post (or edit) one PR comment with the table and verdict ending with `<!-- check-module sha=<head sha> verdict=pass|fail -->`; `/run-plan` merges only on a `pass` for the current head and does not run the check again for the same sha. Never weaken a lint rule, coverage floor or test to make a check pass.
