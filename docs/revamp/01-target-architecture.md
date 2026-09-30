# 01 — Target Architecture & Decisions (greenfield rebuild)

> Status: **Proposed**. The product owner decided (2026-09-30) to **rebuild from scratch** rather than refactor the legacy code, and that **no AWS services or resources are used for deployment** (ADR-011). The ADRs below follow from that decision and need tech-lead sign-off before the scaffold PRs. When accepted, change each ADR status to **Accepted** with the date.

## 1. Guiding principles

1. **New code, same product knowledge.** The legacy code (`CSR_BE` Express/Mongo, `Resilisense-FE` CRA/antd 3) is *reference material only*: read it to confirm a business rule, never copy its patterns. Every rule that must survive is written down in `modules/Mxx-*.md` (formulas, thresholds, state machines).
2. **Backend is the source of truth for every calculation and every permission.** Gap scores, documentation-assessment scores, materiality scores, supplier ranking, KPI roll-ups, project status transitions and edit locks are computed/enforced server-side in pure, unit-tested *engines*. (Legacy computes many of these in the browser and even posts the results — see `00-current-state-review.md`.)
3. **Tenant isolation by construction** — enforced in three layers: route guard → service/repository scoping → PostgreSQL row-level security.
4. **Typed end-to-end.** TypeScript strict on both sides; OpenAPI spec generated from the API code; FE client + React Query hooks generated from it; Zod at every runtime boundary.
5. **Reference data is data.** The ISO 26000 taxonomy (7 core subjects, 41 issues of interest, 609 key considerations), survey templates, checklists, frameworks and their translations live in versioned tables managed through the admin UI — not in 8,000-line JS files.
6. **Boring, maintained tech** with large communities, pinned LTS runtimes, and no abandoned packages.

## 2. System context

**Hard constraint (owner decision, 2026-09-30): no AWS services or AWS resources are used to host, deploy or operate the new system** (no EC2/ECS, S3, CloudFront, RDS, SES, Secrets Manager, CloudWatch, Bedrock, …). The owner chose **self-managed Linux VPS servers** (ADR-011). Everything runs as containers or standard Linux services on those VPSs; the only external pieces are commodity services with drop-in alternatives (S3-*API*-compatible object storage, an email provider, error tracking, uptime monitoring), so the platform can move between VPS providers without code changes.

```
                     ┌──────── Cloudflare (DNS, proxy/WAF, TLS, DDoS, static-asset cache) ────────┐
 Browser ──HTTPS───▶ │ app.resilisense.org · survey.resilisense.org · api.resilisense.org         │
 Respondents ──────▶ └──────────────────────────────┬─────────────────────────────────────────────┘
                                                    │ 443 only, origin firewall allows Cloudflare IPs
  ┌──────────────────────────── Production stack (one per data region: EU · India) ─────────────────────────┐
  │ VPS "app-1" (Ubuntu 24.04 LTS, Docker)            │  VPS "data-1" (Ubuntu 24.04 LTS)                    │
  │  kamal-proxy (TLS origin cert, zero-downtime)     │   PostgreSQL 16 (+ WAL archiving via pgBackRest)    │
  │   ├─ web      (Caddy: SPA + public survey app)    │   Valkey (Redis-compatible, AOF on) — BullMQ        │
  │   ├─ api ×2   (NestJS)  ─────── private network ──┼──▶ port 5432 / 6379 on private interface only      │
  │   ├─ worker   (BullMQ: email, reports/Chromium,   │                                                     │
  │   │            imports, schedules, AI, retention) │  VPS "data-2" (optional, Phase 3): streaming        │
  │   └─ clamav   (clamd)                             │   replica for fail-over + read-only reporting       │
  └───────────────────────────┬───────────────────────┴───────────────────────┬───────────────────────────┘
                              ▼                                               ▼
            S3-API-compatible object storage (VPS provider's            Off-site backups (different provider/
            object storage, or MinIO on a storage VPS):                 region): pgBackRest repo, nightly
            evidence, reports, imports — private bucket                 rclone copy of objects, config backups
  External services (none on AWS): Postmark or SMTP provider (email) · Sentry (errors) · Better Stack / Uptime Kuma (uptime)
                                   · Grafana Cloud or self-hosted Grafana+Loki+Prometheus (logs/metrics) · Anthropic API (M17)
```

## 3. Architecture Decision Records

> **Scaffold notes (2026-09-30, CSR_BE):** NestJS 12 ships ESM-only; the API stays CommonJS and loads Nest via Node's `require(esm)`. Tests use **Vitest** (Jest cannot load ESM Nest on Node 22). **TypeScript 6** because typescript-eslint and @nestjs/swagger don't support 7 yet. `nestjs-zod` doesn't support Nest 12, so Zod validation/OpenAPI helpers live in `src/common/validation/zod.ts`. Prisma pinned to 7.10.0 (npm `latest` points to an 8.0 RC).
>
> **Versions** below are the current stable majors as of 2026-09 (checked on npm: Node 24 LTS, NestJS 12, Prisma 7, Zod 4, BullMQ 6, Vite 8, React 19, React Router 8, TanStack Query 5 / Table 9, Tailwind 4, ECharts 6, Storybook 10, ESLint 10, Vitest 5, TypeScript 7). At scaffold time, use the latest stable major of each and record the exact versions in `package.json` + `.nvmrc`; if a tool in the chain doesn't support TypeScript 7 yet, use the latest 6.x for that repo and note it here.

### ADR-001 Rebuild from scratch in the existing repositories — **Proposed**
- `CSR_BE` becomes the new API; `Resilisense-FE` becomes the new web app. Legacy code is preserved, not deleted from history:
  1. Tag the current `main` as `legacy-v1` and create a long-lived branch **`legacy`** from it in both repos.
  2. **Re-point every production deploy to the `legacy` branch first** (`CSR_BE/.github/workflows/nodejs-cicd.yml` and `Jenkinsfile`, `Resilisense-FE/.github/workflows/main.yml` and `Jenkinsfile` currently deploy on push to `main`). Security hotfixes (Phase 0) go to `legacy`.
  3. Only then does the scaffold PR replace the contents of `main` with the new codebase (keeping `docs/revamp/`, `CLAUDE.md`).
  4. For reference while building: `git worktree add ../CSR_BE-legacy legacy` (read-only), or `git show legacy:server/services/materialityFormula.js`.
- *Alternative:* brand-new repositories. Rejected for now — it loses issue/PR history and access settings; revisit only if the team wants a monorepo (ADR-009).

### ADR-002 Backend framework: **NestJS 12 + TypeScript strict on Node 24 LTS**
Modules, dependency injection, guards and interceptors give every feature module the same shape and make auth/tenancy checks declarative. *Alternative:* Fastify + hand-rolled structure — rejected: we would rebuild guards/DI/module boundaries ourselves.

### ADR-003 Database: **PostgreSQL (16 or newer) + Prisma 7** (replacing MongoDB)
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
- Request/response schemas defined once with **Zod** (own validation pipe + OpenAPI decorators via Zod 4 `toJSONSchema`), exported to `openapi.json` at build; the FE generates its typed client and TanStack Query hooks with **orval**. `openapi.json` is committed and diffed in CI (breaking-change check with `oasdiff`).
- Errors: RFC 9457 `application/problem+json` with stable `type` codes (`forbidden`, `not_found`, `validation_failed`, `conflict`, `invalid_state_transition`, …).
- Idempotency keys (`Idempotency-Key` header) on POSTs that send email or create billable work.
- The same API later becomes the **public API** (feature #17) with personal access tokens/OAuth scopes.
- *Why not GraphQL (legacy choice)?* Per-operation authorisation, rate limiting, caching, file transfer and a public API are all simpler with REST; the legacy GraphQL layer is where most authorisation holes were. Dashboard read-models get dedicated endpoints (`GET /v1/projects/:id/dashboard`).

### ADR-005 Authentication — **short-lived access token + rotating refresh cookie**
- `POST /v1/auth/login` → access JWT (15 min, EdDSA signing key injected as a secret at deploy time, `aud`, `iss`, `exp`; kept **in memory** by the SPA) + refresh token (30 days, opaque, `HttpOnly; Secure; SameSite=Lax; Path=/v1/auth`), stored hashed with rotation and family-reuse detection.
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
| Build | **Vite 8** + React 19 + TypeScript strict |
| Routing | **React Router 8** (data mode: loaders, lazy route modules, typed params via helpers) |
| Server state | **TanStack Query 5** + API client/hooks generated by **orval** from `openapi.json` |
| Client state | URL state first; `zustand` for the few global UI stores (sidebar, command palette) |
| Forms | **React Hook Form + Zod** |
| UI | **Tailwind CSS v4 + shadcn/ui (Radix)**, our tokens — see `02-design-system.md` |
| Tables | TanStack Table 9 + TanStack Virtual |
| Charts | Apache ECharts 6 (modular `echarts/core` imports, SVG renderer, brand theme) |
| i18n | **i18next + react-i18next** (ICU), lazy namespaces, `<html lang dir>` set per locale, RTL via logical CSS |
| Dates/numbers | `date-fns` + `Intl` |
| Reports | Server-rendered (M11); the SPA provides `/print/*` routes that the renderer loads |
| Errors/monitoring | Sentry (FE + BE), source maps uploaded privately |
| Testing | Vitest + Testing Library + MSW; Playwright e2e with axe; Storybook 10 (a11y, RTL, dark toolbars) |
| Lint/format | ESLint 10 flat config (typescript-eslint, react-hooks, jsx-a11y, import) + Prettier; husky + lint-staged |

### ADR-009 Repositories — **two repos, contract via `openapi.json`** (monorepo optional later)
- `CSR_BE` owns `openapi.json`; `Resilisense-FE` pulls it (CI step `npm run api:sync` downloads the artifact of the matching BE release, or reads a pinned version).
- Engines (scoring, materiality, ranking, GHG) live only in the BE; the FE never re-implements them.
- *Alternative:* pnpm + Turborepo monorepo (`apps/api`, `apps/web`, `packages/contracts`) — simpler contract sharing; consider it if the same people work on both sides.

### ADR-010 Cross-cutting services

| Concern | Choice |
|---|---|
| Config | `@nestjs/config` + Zod env schema; boot fails on missing/invalid env; secrets injected at deploy time by Kamal (`.kamal/secrets`, pulled from GitHub Environments secrets or a secret manager such as Bitwarden Secrets Manager, 1Password or Doppler) into container env; never stored in the repo or in images; `.env.example` only in git |
| Logging | `pino` (nestjs-pino) JSON; request id, user id, workspace id; redaction of `authorization`, `cookie`, `password`, `token`, `otp` |
| Security headers | `helmet`, strict CORS allow-list from env, CSP on the SPA (no inline scripts), HSTS |
| Rate limiting | `@nestjs/throttler` with Redis store; stricter on auth, public survey and upload endpoints |
| Files | `StorageAdapter` interface over any S3-API-compatible store (default: the VPS provider's S3-compatible object storage in the same region; MinIO on a storage VPS, Backblaze B2 or Cloudflare R2 work unchanged) using the vendor-neutral `minio` JS client (drivers: `s3` for staging/production, `local` filesystem for development, tests and Claude Code cloud sessions); private bucket, presigned **PUT** URLs (5 min) with signed content-type/length, server-side size + magic-byte verification, ClamAV scan before a file becomes available, `files` table (M14) |
| Email | `EmailAdapter` interface via the `email` queue (drivers: `postmark`, `smtp`, and `log`/`memory` for development and tests); default Postmark (HTTP API + signed webhooks); SMTP adapter (Nodemailer) for any other provider — choose an EU-hosted provider (e.g. Brevo, Mailjet) if EU residency of email data is required; React Email templates, localised, plain-text part; per-workspace branding |
| Observability | OpenTelemetry traces + metrics exported to Grafana Cloud (or self-hosted Grafana + Prometheus + Loki); container logs shipped by Grafana Alloy/Vector; node_exporter + cAdvisor host metrics; Sentry for errors (FE + BE); external uptime checks (Better Stack or Uptime Kuma on a separate host); `/health/live`, `/health/ready` (DB + Redis) |
| Audit | append-only `audit_events` table (M12) |
| Feature flags | simple `feature_flags` table + per-workspace overrides (no external service needed initially) |

### ADR-011 Hosting & deployment — **self-managed VPS, no AWS** — Accepted (owner, 2026-09-30)
Constraints from the owner: nothing on AWS; run on **VPS servers**. Requirements that shape the design: EU **and** India data residency, zero-downtime deploys, point-in-time database recovery, simple operations for a small team, everything reproducible from the repo.

**Provider.** Any KVM VPS provider with (a) a region in the EU and one in India, (b) private networking between VPSs, (c) snapshots, and ideally (d) S3-compatible object storage in the same region. Examples (check current region lists before ordering): OVHcloud (EU + Mumbai), Hetzner (EU only — no India region), Hostinger VPS, Contabo, DigitalOcean Droplets (EU + Bangalore). Choose per region; the setup below is provider-independent. The provider is recorded in `infra/README.md`.

**Topology per region (production).**

| Host | Size (start) | Runs |
|---|---|---|
| `app-1` | 4 vCPU · 8–16 GB RAM · 160 GB NVMe | `kamal-proxy`, `web` (Caddy serving the built SPA and public survey app), `api` ×2 containers, `worker` (incl. Chromium for PDFs), `clamav` |
| `data-1` | 4 vCPU · 16 GB RAM · 320 GB NVMe (+ volume) | PostgreSQL 16 (Docker or distro package, tuned), pgBackRest, Valkey (AOF persistence) |
| `data-2` *(Phase 3, for 99.9 %)* | same as `data-1` | PostgreSQL streaming replica (hot standby) with documented fail-over (Patroni optional later) |
| `app-2` *(when load requires)* | same as `app-1` | second app node behind Cloudflare load balancing |
| `staging` | 4 vCPU · 8 GB | the whole stack on one VPS (Kamal destination `staging`) |

Object storage: the provider's S3-compatible bucket in the same region (private); if the provider has none, a MinIO container on a separate storage VPS with its own volume and nightly off-site replication.

**Deployment — Kamal 2** (config in the repo: `config/deploy.yml`, `config/deploy.staging.yml`, `.kamal/secrets`):
- CI builds one Docker image per commit → pushes to **GitHub Container Registry (GHCR)** → `kamal deploy -d staging` automatically on `main`; production via release tag + manual approval (GitHub Environments) promoting the same image digest.
- `kamal-proxy` does zero-downtime rolling deploys gated on `/health/ready`; `kamal rollback <version>` in seconds; Prisma migrations run as a pre-deploy hook (`kamal app exec --primary "npx prisma migrate deploy"`) and must be backward-compatible (expand → migrate → contract).
- Database and Valkey are Kamal **accessories** on `data-1` (or native packages managed by Ansible — pick one and document it).
- No `git pull`, `npm install` or pm2 on servers — servers only ever run immutable images.

**Provisioning & hardening — Ansible** (`infra/ansible/`), idempotent, run from CI or a maintainer laptop:
Ubuntu 24.04 LTS; non-root deploy user; SSH keys only, password and root login disabled, SSH reachable only via a VPN/mesh (Tailscale/WireGuard) or an IP allow-list; `ufw` (80/443 only from Cloudflare IP ranges on `app-*`, 5432/6379 only on the private network); `unattended-upgrades` with a maintenance window; `fail2ban`; Docker with log rotation; time sync; disk-usage alerts; provider-level disk encryption where available; CIS-inspired sysctl baseline.

**Backups & recovery.**
- PostgreSQL: pgBackRest → off-site S3-compatible repository at a **different provider/region** (e.g. Backblaze B2 or Cloudflare R2): full weekly, differential daily, continuous WAL archiving → **PITR** 14 days, retention 35 days, encrypted (repo cipher).
- Object storage: nightly `rclone sync` to the off-site provider (with `--backup-dir` versioning for 30 days).
- Valkey: AOF + daily RDB copy (queues are recoverable; data of record lives in PostgreSQL).
- Hosts: weekly provider snapshots of `app-*` and `data-*`; everything else is rebuildable from Ansible + Kamal.
- **Restore drill quarterly** (restore to a scratch VPS, run the ETL/consistency checks), result logged in `infra/README.md`.

**Other services (not on AWS).** Email via Postmark or any SMTP provider (don't self-host a mail server — deliverability); Cloudflare free/pro plan for DNS, TLS, WAF, rate limiting and DDoS protection in front of all hosts; Sentry; Better Stack or Uptime Kuma for uptime; Grafana Cloud (or self-hosted Grafana stack) for logs/metrics; Anthropic API directly for M17.

**Operational ownership.** With VPSs the team owns patching, backups, capacity and incident response: on-call rota, runbooks in `infra/runbooks/` (deploy, rollback, DB restore, fail-over, disk full, certificate issues, compromised key), and alerts for CPU/RAM/disk, replication lag, backup age, queue depth, 5xx rate.

**Legacy note:** the legacy system currently runs on AWS (EC2, S3, CloudFront). It stays there only until cut-over; the ETL reads legacy evidence files out of the legacy bucket once (read-only credentials), then all AWS resources are decommissioned (`04-data-migration.md` §6).

## 4. Backend layout (`CSR_BE`, new)
```
CSR_BE/
├─ src/
│  ├─ main.ts                  # HTTP app bootstrap
│  ├─ worker.ts                # BullMQ workers + schedulers
│  ├─ app.module.ts
│  ├─ common/                  # guards (@Can, @Public), tenancy context, errors, pagination, zod pipes
│  ├─ config/                  # env schema
│  ├─ infra/                   # prisma, redis, storage adapter, email adapter, clamav, pdf renderer, anthropic client
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
├─ test/                       # e2e (Vitest + supertest against real Postgres/Redis), golden fixtures
├─ openapi.json                # generated, committed
├─ docker-compose.yml          # postgres, valkey/redis, minio (S3-API), clamav, mailpit
├─ config/deploy.yml          # Kamal 2 deploy config (+ deploy.staging.yml); .kamal/secrets reads secrets at deploy time
├─ infra/                      # ansible/ (VPS provisioning & hardening), runbooks/, README.md (provider, hosts, restore drills)
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
├─ public/
├─ Dockerfile + Caddyfile     # `web` image: static SPA + public survey app, security headers (CSP, HSTS), immutable asset caching
└─ config/deploy.yml          # Kamal 2 config for the `web` app (shares kamal-proxy on app hosts with the API)
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
| local | `docker compose up` (postgres, valkey, minio, clamav, mailpit) + `npm run dev` | seed: reference data + demo workspaces |
| Claude Code cloud session | no Docker daemon: PostgreSQL 16 + Redis started natively by the repo's SessionStart hook; storage `local`, email `log`, ClamAV mocked | seed + test fixtures |
| preview | per-PR FE preview against staging API | staging |
| staging | full stack on one VPS (Kamal destination `staging`), prod-like config | anonymised ETL output, refreshed monthly |
| production | per region: `app-1` + `data-1` VPS (+ `data-2` standby from Phase 3) | |

CI (GitHub Actions) on every PR in both repos: `npm ci` (never `--force`) → `lint` → `typecheck` → `unit tests + coverage` → `build` → BE: `e2e (Postgres + Valkey service containers)` + `openapi diff`; FE: `Playwright smoke + axe` against preview → `npm run audit` (audit-ci with reviewed allowlist), gitleaks, CodeQL.
CD (VPS, no AWS): each repo has its own pipeline and Kamal config; both apps share `kamal-proxy` on the app hosts (routing by host name). `CSR_BE`: merge to `main` → build `api` image (also runs as `worker`) → push to GHCR → `kamal deploy -d staging`. `Resilisense-FE`: merge to `main` → build `web` image (static SPA + survey app served by Caddy) → push to GHCR → `kamal deploy -d staging`. Zero-downtime via kamal-proxy health checks; `kamal rollback` on failure. Production via release tag + manual approval (GitHub Environments) deploying the same image digests; FE releases must target an API version whose `openapi.json` they were generated from. Per-PR FE previews: `web` image on the staging VPS under `pr-<n>.staging.resilisense.org`. No `git pull`/`npm install` on servers, no pm2.

## 8. Non-functional requirements

| Area | Target |
|---|---|
| Performance | p95 API < 300 ms (lists/detail), < 800 ms (dashboards); SPA initial JS < 250 kB gz; LCP < 2 s on 4G |
| Availability | 99.5 % monthly at launch (single DB host, provider SLA), 99.9 % once the standby replica and second app node are in place (Phase 3); zero-downtime deploys; RPO ≤ 5 min (WAL archiving), RTO ≤ 2 h |
| Scale (3-year) | 2,000 workspaces, 50k users, 5M survey answers, 2 TB evidence |
| Security | OWASP ASVS L2; annual pen-test; critical dependency alerts fixed < 48 h |
| Privacy | GDPR/DPDP: export & erasure per workspace and per survey respondent; data residency by deploying one VPS stack per region (EU VPS for EU customers, India VPS for Indian customers; backups stay in the same jurisdiction); sub-processor list (hosting, email, Sentry, logs, Anthropic) published |
| Accessibility | WCAG 2.2 AA |
| Browsers | last 2 versions of Chrome, Edge, Firefox, Safari; iOS 16+, Android 10+ (public survey) |
| Backups | pgBackRest (weekly full, daily diff, continuous WAL → PITR 14 days, retention 35 days) to an off-site S3-compatible repository at another provider; nightly `rclone` copy of object storage; weekly VPS snapshots; quarterly restore drill |
