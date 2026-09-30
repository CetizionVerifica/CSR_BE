# ResiliSense API (2.0)

Multi-tenant CSR/ESG assessment platform — ISO 26000 gap analysis, documentation assessment, materiality, actions & KPIs, supply-chain ranking. This repo is the **backend**; the web app is [`Resilisense-FE`](https://github.com/CetizionVerifica/Resilisense-FE).

> The product is being rebuilt from scratch. Plan, architecture and every module spec: **[`docs/revamp/`](docs/revamp/README.md)**. The legacy Express/Mongo app lives on the `legacy` branch.

## Stack

Node 24 LTS (≥ 22.12 works) · NestJS 12 · TypeScript 6 (strict) · PostgreSQL 16+ with row-level security · Prisma 7 · Zod 4 · REST + OpenAPI · BullMQ on Redis/Valkey · Vitest · pino. Deployed as Docker images with Kamal to self-managed VPS servers — **no AWS** (ADR-011).

## Getting started

```bash
cp .env.example .env
docker compose up -d            # postgres, valkey, minio, clamav, mailpit
# (no Docker? Ubuntu with postgresql + redis-server installed: ./scripts/dev-services.sh)
npm install                     # also runs prisma generate
npm run db:migrate              # apply migrations (incl. RLS policies)
npm run db:seed                 # ISO 26000 reference data: 7 core subjects, 41 issues, 609 KCs
npm run dev                     # http://localhost:4000/v1/health/ready · API docs at /docs
npm run worker:dev              # background jobs (email, …)
```

Claude Code cloud sessions do all of this automatically via `.claude/hooks/session-start.sh`.

## Scripts

| Command                                    | What it does                                                               |
| ------------------------------------------ | -------------------------------------------------------------------------- |
| `npm run lint` / `format` / `typecheck`    | ESLint (type-aware), Prettier, `tsc --noEmit`                              |
| `npm test`                                 | Unit tests (Vitest) — engines, adapters, guards, seed parser               |
| `npm run test:e2e`                         | API tests against real PostgreSQL + Redis (`TEST_DATABASE_URL`)            |
| `npm run openapi`                          | Regenerate `openapi.json` (commit it; the FE generates its client from it) |
| `npm run audit`                            | Production dependency audit gate (`audit-ci.jsonc`)                        |
| `npm run build` / `start` / `start:worker` | Production build and processes                                             |

## Layout

```
src/
  main.ts · worker.ts · app.module.ts · bootstrap.ts
  config/        env schema (Zod) — boot fails on invalid config
  common/        auth decorators + guard (@Can / @Public), problem+json errors, Zod validation, ids
  infra/         prisma (tenancy), redis, queues, storage adapter, email adapter, logging
  modules/       one folder per spec (health for now; M01… next)
prisma/          schema, migrations (incl. RLS), seed
test/            e2e tests
```

## Key rules

See [`CLAUDE.md`](CLAUDE.md): every route is `@Public()` or `@Can()`, tenant tables are RLS-protected (`prisma.withTenant(workspaceId, tx => …)`), calculations live in pure `engine/` modules, no secrets in git.
