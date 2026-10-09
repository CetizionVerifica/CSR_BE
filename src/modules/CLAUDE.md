# src/modules — feature modules (layer rules)

Level 1 of the CLAUDE.md layers (`docs/revamp/06-modular-build.md` §2). Each folder here is one module of the plan; its own `CLAUDE.md` (the module card) adds the module-specific contract. Read the card before touching a module.

## Anatomy of a module

```
src/modules/<module>/
├─ CLAUDE.md            module card: contract, components, invariants (06 §2.1)
├─ index.ts             public surface — the only file other modules may import
├─ <module>.module.ts   Nest module; providers private unless exported for index.ts
├─ *.controller.ts      HTTP only: @Can/@Authenticated/@Public, Zod pipes, @ApiZod* docs, no logic
├─ *.service.ts         use cases: transactions via prisma.withTenant, audit entries, events
├─ *.repository.ts      the only place that touches Prisma for this module's tables
├─ dto/                 Zod schemas for bodies, queries and responses
├─ engine/              pure functions (no I/O, no Nest, no Prisma) + *.spec.ts + *.property.spec.ts
├─ events.ts            event/audit action name constants (`<entity>.<verb>`)
└─ __tests__/fakes/     contract fakes of the modules this one depends on
```

E2e tests live in `test/<module>-*.e2e-spec.ts` (see `test/CLAUDE.md`).

## Boundaries (lint: `resilisense/module-boundaries`)

- Import another module only from its folder (`'../identity'`), which resolves to its `index.ts`. Never `'../identity/users.repository'`.
- Need something it doesn't export? Add the export to its `index.ts` with a one-line reason in its card's "Public surface", in the same PR.
- Never read or write another module's tables, and never join them. Ask through an exported query method that returns a read-model type, or react to its event.
- Foreign keys only to kernel tables (`workspaces`, `companies`, `users`, `files`, reference data). Other modules' records are referenced by `uuid` only.
- `src/common`, `src/infra` and `src/config` never import a module (one exception: the pure M01 permission matrix).
- `src/app.module.ts` and `src/worker.ts` are the composition roots: one import line per module.

## Rules every module follows

- Every route has `@Can('<resource>:<action>')`, `@Authenticated()` or `@Public()`; permissions are added to the M01 matrix (`identity/engine/permissions.ts`) and the module's entitlement checked.
- Tenant tables: `workspace_id`, RLS migration + isolation test, queries inside `prisma.withTenant`.
- Scores and calculations only in `engine/`, table-driven + property-based tests, never accepted from the client.
- Side effects (email, PDFs, imports, external APIs) in BullMQ processors, registered in `src/worker.ts`.
- Errors are problem+json with a `type` from `PROBLEM_TYPES`; every status a route returns is documented.
- Regenerate and commit `openapi.json` with every API change; add the module to `spec-coverage.json` when it is implemented.

## Building one module without the others

Write the contract first (`/module-contract`), then `/build-module`. Dependencies that are not built yet are replaced by fakes in `__tests__/fakes/` that implement exactly the methods their spec §14 promises. `/check-module` compares fakes with the real `index.ts` once the dependency lands.

## Modules in this repo and planned

Built: `identity` (M01), `workspaces` (M02), `audit` (M12 slice), `health`. Planned folders and their waves: `06-modular-build.md` §5–§6 (supplier-register, supplier-portal, questionnaires, supplier-evidence, risk, screening, dd-audits, corrective-actions, monitoring, grievances, dd-reporting, esg-data, files, notifications, reference-data).
