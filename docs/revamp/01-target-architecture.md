# 01 — Target Architecture & Decisions (greenfield rebuild)

> Status: **Proposed**. The product owner decided (2026-09-30) to **rebuild from scratch** rather than refactor the legacy code. The ADRs below follow from that decision and need tech-lead sign-off before the scaffold PRs. When accepted, change each ADR status to **Accepted** with the date.

## 1. Guiding principles

1. **New code, same product knowledge.** The legacy code (`CSR_BE` Express/Mongo, `Resilisense-FE` CRA/antd 3) is *reference material only*: read it to confirm a business rule, never copy its patterns. Every rule that must survive is written down in `modules/Mxx-*.md` (formulas, thresholds, state machines).
2. **Backend is the source of truth for every calculation and every permission.** Gap scores, documentation-assessment scores, materiality scores, supplier ranking, KPI roll-ups, project status transitions and edit locks are computed/enforced server-side in pure, unit-tested *engines*. (Legacy computes many of these in the browser and even posts the results — see `00-current-state-review.md`.)
3. **Tenant isolation by construction** — enforced in three layers: route guard → service/repository scoping → PostgreSQL row-level security.
4. **Typed end-to-end.** TypeScript strict on both sides; OpenAPI spec generated from the API code; FE client + React Query hooks generated from it; Zod at every runtime boundary.
5. **Reference data is data.** The ISO 26000 taxonomy (7 core subjects, 41 issues of interest, 609 key considerations), survey templates, checklists, frameworks and their translations live in versioned tables managed through the admin UI — not in 8,000-line JS files.
6. **Boring, maintained tech** with large communities, pinned LTS runtimes, and no abandoned packages.

## 2. System context

```
                 ┌──────────────────────────────── AWS (eu-central-1 / ap-south-1 per data residency) ──────┐
 Browser ──HTTPS─▶ CloudFront ─▶ S3 (web SPA, hashed assets, strict CSP)                                    │
   │                                                                                                         │
   └──HTTPS─▶ api.resilisense.org ─▶ ALB ─▶ api (NestJS, ECS Fargate, N tasks) ──▶ PostgreSQL 16 (RDS/Aurora)│
 Survey respondents / suppliers (public, token links) ─┘        │    │   └──────▶ Redis (queues, rate limits, cache)
                                                                  │    └──────────▶ S3 (evidence, reports; private, versioned)
                                                                  ▼
                                                     worker (same image, `node dist/worker.js`)
                                                       ├─ email (Amazon SES)
                                                       ├─ report rendering (Playwright/Chromium → PDF; docx/pptx)
                                                       ├─ imports (CSV/XLSX)
                                                       ├─ scheduled jobs (reminders, digests, expiries, retention)
                                                       └─ AI jobs (Claude API) — M17
                 └────────────────────────────────────────────────────────────────────────────────────────────┘
```

## 3. Architecture Decision Records

### ADR-001 Rebuild from scratch in the existing repositories — **Proposed**
- `CSR_BE` becomes the new API; `Resilisense-FE` becomes the new web app. Legacy code is preserved, not deleted from history:
  1. Tag the current `main` as `legacy-v1` and create a long-lived branch **`legacy`** from it in both repos.
  2. **Re-point every production deploy to the `legacy` branch first** (`CSR_BE/.github/workflows/nodejs-cicd.yml` and `Jenkinsfile`, `Resilisense-FE/.github/workflows/main.yml` and `Jenkinsfile` currently deploy on push to `main`). Security hotfixes (Phase 0) go to `legacy`.
  3. Only then does the scaffold PR replace the contents of `main` with the new codebase (keeping `docs/revamp/`, `CLAUDE.md`).
  4. For reference while building: `git worktree add ../CSR_BE-legacy legacy` (read-only), or `git show legacy:server/services/materialityFormula.js`.
- *Alternative:* brand-new repositories. Rejected for now — it loses issue/PR history and access settings; revisit only if the team wants a monorepo (ADR-009).

### ADR-002 Backend framework: **NestJS 11 + TypeScript strict on Node 22 LTS**
Modules, dependency injection, guards and interceptors give every feature module the same shape and make auth/tenancy checks declarative. *Alternative:* Fastify + hand-rolled structure — rejected: we would rebuild guards/DI/module boundaries ourselves.

### ADR-003 Database: **PostgreSQL 16 + Prisma ORM** (replacing MongoDB)
Why change now that we start from scratch:
- The domain is **relational**: workspaces ↔ users ↔ companies ↔ projects ↔ answers ↔ question library ↔ framework mappings ↔ KPIs ↔ suppliers. Legacy Mongo models maintain bidirectional ID arrays by hand without transactions (`company.projects`, `agency.users`, `user.agencies`…) — a steady source of orphaned and inconsistent data.
- **Row-level security** gives database-enforced tenant isolation as a last line of defence.
- **Exact numerics** (`numeric`) for audited scores, KPIs and emissions; **transactions** for multi-step workflows (submit assessment, close survey); strong constraints (FK, unique, check) for data quality.
- `jsonb` still covers the genuinely flexible parts (custom inputs on a key consideration, survey answer payloads).
- Data from MongoDB is moved **once**, at cut-over, by an ETL (`04-data-migration.md`); the legacy data model has to be reshaped anyway.
- Conventions: `id uuid` (UUIDv7, generated in app), `workspace_id uuid not null` on every tenant-owned table, `created_at/updated_at timestamptz`, `created_by/updated_by uuid`, soft delete `deleted_at` where users can restore, snake_case columns (Prisma `@map`), all FKs indexed.
- Tenancy: a Prisma client extension wraps each request in a transaction that runs `select set_config('app.workspace_id', $1, true)`; RLS policies `using (workspace_id = current_setting('app.workspace_id')::uuid)`. The API connects with a role **without** `BYPASSRLS`; migrations and platform jobs use a separate role.
- *Alternative:* keep MongoDB (Atlas) — viable if the team strongly prefers it; then replace RLS with a mandatory Mongoose tenancy plugin and use multi-document transactions. Document the choice here if this alternative is taken.

### ADR-004 API style: **REST + OpenAPI 3.1**, versioned under `/v1`
- Resource-oriented REST, JSON, cursor pagination (`?cursor=&limit=`), filtering `?filter[status]=…`, sorting `?sort=-updatedAt`, sparse includes where needed.
- Request/response schemas defined once with **Zod** (`nestjs-zod`), exported to `openapi.json` at build; the FE generates its typed client and TanStack Query hooks with **orval**. `openapi.json` is committed and diffed in CI (breaking-change check with `oasdiff`).
- Errors: RFC 9457 `application/problem+json` with stable `type` codes (`forbidden`, `not_found`, `validation_failed`, `conflict`, `invalid_state_transition`, …).
- Idempotency keys (`Idempotency-Key` header) on POSTs that send email or create billable work.
- The same API later becomes the **public API** (feature #17) with personal access tokens/OAuth scopes.
- *Why not GraphQL (legacy choice)?* Per-operation authorisation, rate limiting, caching, file transfer and a public API are all simpler with REST; the legacy GraphQL layer is where most authorisation holes were. Dashboard read-models get dedicated endpoints (`GET /v1/projects/:id/dashboard`).

### ADR-005 Authentication — **short-lived access token + rotating refresh cookie**
- `POST /v1/auth/login` → access JWT (15 min, EdDSA, `aud`, `iss`, `exp`; kept **in memory** by the SPA) + refresh token (30 days, opaque, `HttpOnly; Secure; SameSite=Lax; Path=/v1/auth`), stored hashed with rotation and family-reuse detection.
- API on `api.resilisense.org`, SPA on `app.resilisense.org` → same site, first-party cookie.
- Passwords `argon2id`; legacy bcrypt hashes are imported and upgraded at first login.
- TOTP MFA; OIDC SSO (Entra ID, Google) in Phase 3. Details in **M01**.

### ADR-006 Authorisation — **RBAC + entitlements + scope, deny by default**
- Permission strings `<resource>:<action>` (`gap:answer`, `gap:review`, `survey:send`…). Roles per membership; entitlements per workspace (modules bought, limits).
- Every controller method must carry `@Can('…')` or `@Public()`; a unit test enumerates all routes and fails if one has neither. Role matrix in **M01**.

### ADR-007 Background work — **BullMQ on Redis**
Queues: `email`, `report-render`, `import`, `survey`, `ai`, `scheduled`, `retention`. Retries with backoff, dead-letter queue, Bull Board for platform owners only. Scheduled jobs via BullMQ repeatable jobs (replaces the broken, never-run `Cronjob/cronjobs.js`).

### ADR-008 Frontend stack
| Concern | Choice |
|---|---|
| Build | **Vite 6** + React 19 + TypeScript strict |
| Routing | **React Router 7** (data mode: loaders, lazy route modules, typed params via helpers) |
| Server state | **TanStack Query 5** + API client/hooks generated by **orval** from `openapi.json` |
| Client state | URL state first; `zustand` for the few global UI stores (sidebar, command palette) |
| Forms | **React Hook Form + Zod** |
| UI | **Tailwind CSS v4 + shadcn/ui (Radix)**, our tokens — see `02-design-system.md` |
| Tables | TanStack Table 8 + TanStack Virtual |
| Charts | Apache ECharts 5 (modular `echarts/core` imports, SVG renderer, brand theme) |
| i18n | **i18next + react-i18next** (ICU), lazy namespaces, `<html lang dir>` set per locale, RTL via logical CSS |
| Dates/numbers | `date-fns` + `Intl` |
| Reports | Server-rendered (M11); the SPA provides `/print/*` routes that the renderer loads |
| Errors/monitoring | Sentry (FE + BE), source maps uploaded privately |
| Testing | Vitest + Testing Library + MSW; Playwright e2e with axe; Storybook 8 (a11y, RTL, dark toolbars) |
| Lint/format | ESLint 9 flat config (typescript-eslint, react-hooks, jsx-a11y, import) + Prettier; husky + lint-staged |

### ADR-009 Repositories — **two repos, contract via `openapi.json`** (monorepo optional later)
- `CSR_BE` owns `openapi.json`; `Resilisense-FE` pulls it (CI step `npm run api:sync` downloads the artifact of the matching BE release, or reads a pinned version).
- Engines (scoring, materiality, ranking, GHG) live only in the BE; the FE never re-implements them.
- *Alternative:* pnpm + Turborepo monorepo (`apps/api`, `apps/web`, `packages/contracts`) — simpler contract sharing; consider it if the same people work on both sides.

### ADR-010 Cross-cutting services
| Concern | Choice |
|---|---|
| Config | `@nestjs/config` + Zod env schema; boot fails on missing/invalid env; secrets from AWS Secrets Manager; `.env.example` only in git |
| Logging | `pino` (nestjs-pino) JSON; request id, user id, workspace id; redaction of `authorization`, `cookie`, `password`, `token`, `otp` |
| Security headers | `helmet`, strict CORS allow-list from env, CSP on the SPA (no inline scripts), HSTS |
| Rate limiting | `@nestjs/throttler` with Redis store; stricter on auth, public survey and upload endpoints |
| Files | S3 private bucket, presigned POST with size/type conditions (5 min), magic-byte check after upload, GuardDuty Malware Protection for S3, `files` table (M14) |
| Email | Amazon SES via `email` queue; React Email templates, localised, plain-text part; per-workspace branding |
| Observability | OpenTelemetry traces + metrics; `/health/live`, `/health/ready` (DB + Redis) |
| Audit | append-only `audit_events` table (M12) |
| Feature flags | simple `feature_flags` table + per-workspace overrides (no external service needed initially) |

## 4. Backend layout (`CSR_BE`, new)
```
CSR_BE/
├─ src/
│  ├─ main.ts                  # HTTP app bootstrap
│  ├─ worker.ts                # BullMQ workers + schedulers
│  ├─ app.module.ts
│  ├─ common/                  # guards (@Can, @Public), tenancy context, errors, pagination, zod pipes
│  ├─ config/                  # env schema
│  ├─ infra/                   # prisma, redis, s3, ses, pdf renderer, anthropic client
│  └─ modules/
│     ├─ identity/             # M01
│     ├─ workspaces/           # M02 (workspaces, companies, entitlements, partners)
│     ├─ projects/             # M03
│     ├─ gap-analysis/         # M04  (engine/ = pure scoring functions)
│     ├─ doc-assessment/       # M05  (engine/)
│     ├─ materiality/          # M06  (engine/)
│     ├─ stakeholders/         # M07
│     ├─ surveys/              # M08
│     ├─ actions-kpis/         # M09
│     ├─ supply-chain/         # M10  (engine/ = ranking)
│     ├─ reporting/            # M11
│     ├─ notifications/        # M12 (+ audit)
│     ├─ platform-admin/       # M13 (content library, platform users)
│     ├─ files/                # M14
│     ├─ i18n-content/         # M15
│     ├─ frameworks/           # M16
│     ├─ ai-assistant/         # M17
│     └─ carbon/               # M18  (engine/)
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/
│  ├─ rls/                     # SQL for RLS policies (applied by migration)
│  └─ seed/                    # reference data: taxonomy, question library, templates (from legacy files)
├─ etl/                        # one-off Mongo → Postgres migration (04-data-migration.md)
├─ test/                       # e2e (supertest + Testcontainers Postgres/Redis), golden fixtures
├─ openapi.json                # generated, committed
├─ docker-compose.yml          # postgres, redis, minio, mailpit
└─ Dockerfile
```
Each module: `*.module.ts`, `*.controller.ts`, `*.service.ts`, `*.repository.ts` (Prisma access only here), `dto/*.ts` (Zod), `engine/*.ts` (pure, no I/O), `events.ts`, `__tests__/`.

## 5. Frontend layout (`Resilisense-FE`, new)
```
Resilisense-FE/
├─ src/
│  ├─ app/                     # providers, router, shell (Sidebar, TopBar, CommandPalette), error boundaries
│  ├─ components/ui/           # design-system primitives (shadcn-owned)
│  ├─ components/charts/       # ResiliChart + signature charts
│  ├─ features/<module>/       # routes.tsx, pages/, components/, hooks/, schemas.ts — one folder per Mxx spec
│  ├─ api/                     # GENERATED by orval — never edit by hand
│  ├─ lib/                     # auth, permissions, i18n, formatters, query client
│  ├─ locales/<lang>/<ns>.json
│  └─ test/                    # MSW handlers, test utils
├─ e2e/                        # Playwright
├─ .storybook/
└─ public/
```

## 6. Delivery strategy (greenfield)
1. **Phase 0 — secure the live legacy system** (on the `legacy` branch). It keeps serving customers for months; the account-takeover holes cannot wait for the rebuild.
2. **Build the new system in parallel** on new infrastructure (staging + production), with its own PostgreSQL. Seed reference data (taxonomy, 609 key considerations, survey templates, checklists) from the legacy files via `prisma/seed`.
3. **Golden-master verification**: export an anonymised legacy snapshot; run the ETL into staging; for each closed project compare the new engines' outputs (gap totals, revised scores, materiality weights) with the stored legacy values. Differences must be listed in the module's "Intentional changes" section or fixed.
4. **Pilot** with 2–3 friendly customers on the new app (their data migrated individually).
5. **Cut-over**: announce, freeze legacy writes, final ETL, switch DNS, keep legacy read-only for 90 days, then decommission (keep an encrypted archive of the Mongo dump per retention policy).

## 7. Environments & CI/CD
| Env | Purpose | Data |
|---|---|---|
| local | `docker compose up` (postgres, redis, minio, mailpit) + `npm run dev` | seed: reference data + demo workspaces |
| preview | per-PR FE preview against staging API | staging |
| staging | full stack, prod-like | anonymised ETL output, refreshed monthly |
| production | | |

CI (GitHub Actions) on every PR in both repos: `npm ci` (never `--force`) → `lint` → `typecheck` → `unit tests + coverage` → `build` → BE: `e2e (Testcontainers)` + `openapi diff`; FE: `Playwright smoke + axe` against preview → `npm audit --omit=dev`, gitleaks, CodeQL.
CD: merge to `main` → deploy to staging (BE Docker image → ECR via GitHub OIDC → ECS rolling deploy with health checks; FE → S3 + CloudFront invalidation). Production via release tag + manual approval (GitHub Environments). No SSH deploys, no `git pull` on servers, no pm2.

## 8. Non-functional requirements
| Area | Target |
|---|---|
| Performance | p95 API < 300 ms (lists/detail), < 800 ms (dashboards); SPA initial JS < 250 kB gz; LCP < 2 s on 4G |
| Availability | 99.9 % monthly; zero-downtime deploys |
| Scale (3-year) | 2,000 workspaces, 50k users, 5M survey answers, 2 TB evidence |
| Security | OWASP ASVS L2; annual pen-test; critical dependency alerts fixed < 48 h |
| Privacy | GDPR/DPDP: export & erasure per workspace and per survey respondent; data residency (EU / India) by deployment region |
| Accessibility | WCAG 2.2 AA |
| Browsers | last 2 versions of Chrome, Edge, Firefox, Safari; iOS 16+, Android 10+ (public survey) |
| Backups | PITR 7 days, daily snapshots 35 days, S3 versioning; quarterly restore drill |
