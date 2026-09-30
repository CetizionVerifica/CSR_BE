---
description: Implement one ResiliSense 2.0 module in this repo (backend) from its spec in docs/revamp/modules
argument-hint: <module id, e.g. M04> [extra notes]
---

Implement module **$ARGUMENTS** in this repository (CSR_BE — the new NestJS API).

1. Read `CLAUDE.md`, `docs/revamp/README.md`, `docs/revamp/01-target-architecture.md` and the module spec `docs/revamp/modules/<id>-*.md` (the id is the first word of the arguments). Read any spec it depends on for the parts you touch.
2. If the spec status is not `Ready`, or anything needed to implement it is ambiguous, contradictory or missing, stop and list the questions with a proposed spec change — do not guess.
3. Plan first: list the Prisma models + migrations (with RLS policies), engine functions, services, controllers/routes with their `@Can` permissions, events/audit entries, and tests. Wait for approval if running interactively.
4. Implement following the architecture rules in `CLAUDE.md`:
   - calculations only in `engine/` as pure functions, with table-driven tests for every edge case the spec lists (and golden-master tests when fixtures exist in `test/fixtures/golden/`);
   - e2e tests for happy path, forbidden role, other-workspace access (404) and invalid state transition/lock;
   - regenerate and commit `openapi.json`.
5. Run lint, typecheck, unit and e2e tests; fix until green.
6. Update the spec status line to `In progress` (both repos' `docs/revamp` copies must stay identical — note in the PR if the FE copy needs the same edit).
7. Commit with Conventional Commits, push, and open a PR titled `feat(<module>): …` whose body maps each change to the spec sections (e.g. "Implements M04 §7.1–§7.4, §8").
