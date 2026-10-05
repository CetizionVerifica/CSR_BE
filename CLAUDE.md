# CLAUDE.md — CSR_BE (ResiliSense API)

ResiliSense is a multi-tenant CSR/ESG assessment SaaS (ISO 26000 gap analysis, documentation assessment, stakeholder materiality, actions & KPIs, supply-chain ranking). This repo is the **backend**. The frontend is `CetizionVerifica/Resilisense-FE`.

## Current state — read first

- The product is being **rebuilt from scratch** ("ResiliSense 2.0"). The complete plan and every module spec live in [`docs/revamp/`](docs/revamp/README.md) — that folder is the source of truth. Read `docs/revamp/README.md`, then the spec of the module you are working on, before writing code.
- `main` holds the **new** NestJS codebase. The legacy Express + Mongo app lives on the **`legacy`** branch (tag `legacy-v1`), which production still deploys from until cut-over.
- Legacy code is **reference only**: read it to confirm a business rule, never copy its patterns (it has no tenant isolation, secrets in `server/config/*.js`, business logic in resolvers, broken Mongoose 8 calls). Every rule worth keeping is written down in the module specs with formulas.
- Consult legacy without mixing it into new code: `git worktree add ../CSR_BE-legacy legacy` or `git show legacy:<path>`.

### If you are asked to fix the legacy system (Phase 0 only)

Work on the `legacy` branch, keep changes minimal, and follow `docs/revamp/00-current-state-review.md` §2. Never print, copy or commit secret values; `server/config/dev.js` and `prod.js` contain live credentials that must be rotated and moved to environment variables.

## Target stack (see `docs/revamp/01-target-architecture.md`)

Node 24 LTS (≥ 22.12 works) · NestJS 12 (ESM-only; our code is CommonJS and loads it via `require(esm)`) · TypeScript 6 strict (TS 7 once typescript-eslint/@nestjs/swagger support it) · PostgreSQL 16+ with RLS · Prisma 7.10 (client generated to `src/generated/prisma`, gitignored) · Zod 4 with our helpers in `src/common/validation/zod.ts` (`nestjs-zod` doesn't support Nest 12) · REST + OpenAPI · BullMQ + Redis-compatible Valkey · S3-API-compatible object storage via `StorageAdapter` (presigned PUT, ClamAV scan) · `EmailAdapter` (Postmark/SMTP/log) · pino · **Vitest** + supertest (Jest can't load ESM Nest on Node 22) · Docker images deployed with **Kamal 2** to self-managed **VPS** servers (Ansible in `infra/ansible/`); Cloudflare in front.

**No AWS — self-managed VPS.** The owner has ruled out AWS and chose VPS hosting (ADR-011): do not add AWS services, AWS-specific SDK features, IAM/CloudFormation/CDK/Terraform-for-AWS, Bedrock, SES, S3-hosted assets or GitHub Actions that deploy to AWS. Keep integrations behind adapters (`StorageAdapter`, `EmailAdapter`) so the provider stays swappable. The only AWS interaction allowed is the one-off, read-only copy of legacy evidence files during migration (`docs/revamp/04-data-migration.md`).

## Commands

```bash
docker compose up -d          # postgres, valkey, minio (S3-API), clamav, mailpit (local machine)
                              # Claude Code cloud sessions have no Docker daemon: the SessionStart hook starts
                              # the native PostgreSQL 16 + Redis instead; use STORAGE_DRIVER=local, EMAIL_DRIVER=log
npm ci
npm run db:migrate            # prisma migrate dev (+ RLS policies in prisma/rls)
npm run db:seed               # reference data: ISO 26000 taxonomy (609 KCs), templates, sectors, units
npm run dev                   # API on :4000 (watch)
npm run worker:dev            # BullMQ workers
npm run lint && npm run typecheck
npm test                      # unit (engines, services)
npm run test:e2e              # API e2e against real PostgreSQL + Redis (TEST_DATABASE_URL; CI uses service containers)
npm run audit                 # production dependency audit gate (reviewed allowlist in audit-ci.jsonc)
npm run openapi               # regenerate openapi.json — commit it; FE generates its client from it
npm run seed:owner -- --email you@example.com   # first platform owner (prints one-time reset link)
kamal deploy -d staging       # deploy (CI does this on main); kamal rollback <version> to roll back
```

Infrastructure changes (hosts, firewall, backups) go through `infra/ansible/` and `config/deploy*.yml`, never by hand on a server; update the runbooks in `infra/runbooks/` when operations change.
Run lint, typecheck and the relevant tests before every commit. Never use `npm install --force` / `npm ci --force`.

## Architecture rules

- **Module layout** — one folder per spec under `src/modules/<module>/`: `*.module.ts`, `*.controller.ts`, `*.service.ts`, `*.repository.ts`, `dto/`, `engine/`, `events.ts`, `__tests__/`. Module IDs map to `docs/revamp/modules/Mxx-*.md`.
- **Engines are pure** — scoring and calculation logic (gap weights, verified scores, materiality, ranking, GHG) lives in `engine/` as pure functions with no I/O, fully unit-tested, including golden-master fixtures from legacy data (`test/fixtures/golden/`). Never re-implement a formula outside its engine, and never accept a computed score from the client.
- **Database access only in repositories** via Prisma. Tables: snake_case, `id uuid` (UUIDv7), `workspace_id` on every tenant-owned table, `created_at/updated_at`, `numeric` for scores/KPIs/emissions (never floats for audited values).
- **Tenancy** — tenant-table queries run inside `prisma.withTenant(workspaceId, tx => …)`, which sets `app.workspace_id` for that transaction only. Every tenant table gets `ENABLE` + `FORCE ROW LEVEL SECURITY` and a policy using `app_current_workspace()` in a migration (pattern: `prisma/migrations/*_rls_tenant_tables`) plus isolation tests like `test/tenancy-rls.e2e-spec.ts`. Cross-tenant reads (platform assessors, supplier sharing) go through explicit, audited repository methods, never by disabling RLS.
- **Authorisation** — every controller method has `@Can('<resource>:<action>')`, `@Authenticated()` (own resources such as `/me`, no permission) or `@Public()`; a test fails the build otherwise. Routes with a `:wid` segment answer `404` unless it is the caller's current workspace (checked by the guard). Check role and entitlement (module bought) and scope. Role matrix: `docs/revamp/modules/M01-identity-access.md`.
- **State machines** — project/workstream transitions only through the transition service (M03 §7), which validates the transition, writes `state_transitions`, emits events and enforces edit locks.
- **API** — REST under `/v1`, Zod schemas validated with `ZodValidationPipe` and documented with `@ApiZodBody`/`@ApiZodOk`, cursor pagination, errors as RFC 9457 problem+json with stable `type` codes, `Idempotency-Key` on POSTs that send email or start jobs. Every change to the API must regenerate and commit `openapi.json`.
- **Side effects** — email, report rendering, imports, AI calls and reminders run in BullMQ workers, never in the request path. Emit domain events; write `audit_events` for data changes and security events (M12).
- **Config** — all config from env validated by Zod at boot (secrets arrive as encrypted platform env vars); `.env.example` is the only env file in git. No secrets in code, tests, fixtures or logs.
- **Logging** — pino with redaction (`authorization`, `cookie`, `password`, `token`, `otp`); never log request/response bodies.

## Security checklist (every PR)

Auth/permission decorator present (`@Can`/`@Authenticated`/`@Public`) · tenant scoping tested (another workspace gets 404) · input validated with Zod · no raw user input in regexes or dynamic field names · no secrets/PII in logs · file uploads via presigned PUT with signed type/size, post-upload size + magic-byte check and ClamAV scan · rate limits on public endpoints.

## Testing expectations

- Engines: table-driven unit tests covering the edge cases listed in the spec (band boundaries, empty denominators, missing classes…).
- Services/controllers: e2e tests for happy path, forbidden role, other-workspace access, invalid state transition.
- Bug fixes start with a failing test.
- Every e2e response is checked against the OpenAPI contract (`test/support/contract.ts`): document every status a route returns, and keep errors as problem+json with a type from `PROBLEM_TYPES`. Breaking `openapi.json` changes fail the **API contract** workflow unless the PR is labelled `api-breaking` (playbook §5).
- Tag tests with the spec story they prove (`'US-02-3: …'`); `npm run spec:coverage` fails on an untested or unknown story (waivers with a reason in `spec-coverage.json`). Add the module there when you implement it.
- Every engine gets property-based tests in `engine/*.property.spec.ts` (fast-check) besides table-driven ones. Coverage floors in `vitest.config*.mts` only go up.
- The **API fuzz** workflow (Schemathesis) fails on any 5xx: oversized bodies answer 413 `payload_too_large`, NUL characters in input answer 400 `validation_failed`. **Mutation testing** (Stryker; on every PR for the engine files it changes, nightly for all) fails when engine tests miss too many planted bugs. All CI checks are required before merge (playbook §5).

## Conventions

- TypeScript strict, no `any` (use `unknown` + Zod). Named exports. Filenames kebab-case.
- Conventional Commits (`feat(gap-analysis): …`, `fix(identity): …`). One module per PR where possible; reference the spec section (e.g. "Implements M04 §7.2").
- If implementation needs to deviate from a spec, update the spec in the same PR **in both repos** (`docs/revamp/` is mirrored in `Resilisense-FE`).
- Domain names follow the specs: _workspace_ (legacy "agency"), _company_, _project_, _key consideration (KC)_, _issue of interest_, _core subject_, _documentation assessment_, _people_ (employees + stakeholders).

## Key legacy references (for verifying business rules only)

| Rule                                                     | Legacy file                                                                                   |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Gap weights & revised scores                             | `server/schema/mutations/gapAnalysis/_helper.js`, `server/helpers/utils.js`                   |
| Project totals & review submission                       | `server/schema/mutations/project/update.js`                                                   |
| Survey materiality formula                               | `server/services/materialityFormula.js` (+ `Docs/survey inputs.docx`)                         |
| Legacy manual materiality credits                        | `server/schema/mutations/materiality/_helper.js`                                              |
| ISO 26000 keys (incl. typos to preserve as `legacy_key`) | `server/services/mappings.js`                                                                 |
| KC library                                               | `Docs/GapAnalysisV2.xlsx`, FE `src/common/gapAnalysisQuestions.js`                            |
| Survey templates                                         | `server/helpers/survey_templates/template_{internal,external}.js` (not the `* copy.js` files) |
