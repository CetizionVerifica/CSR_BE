# External ESG data (M26 · SD16)

> Spec: `docs/revamp/modules/M26-esg-data.md` · Status: Draft · Wave: 4 (optional — CSRhub licence pending)

## Purpose

Fetches external ESG ratings (first provider: CSRhub) for suppliers a person has matched to a provider entity, caches one value per entity per month, and publishes each value with its source and date so `risk` can show it as a separate factor and reports can cite it. Off by default: nothing runs until the licence is signed and the workspace has the `esg_data` entitlement.

## Owns

- Platform cache tables (provider data, no `workspace_id`, no RLS, read only through this module's repository): `esg_provider_entities`, `esg_ratings` (unique provider + entity + month), `esg_refresh_runs`.
- Tenant tables (`workspace_id`, RLS `ENABLE` + `FORCE`): `esg_matches` (unique workspace + supplier + provider), `esg_subjects` (supplier attributes copied from events). `supplier_id` is a plain `uuid`; FKs only to `workspaces`, `users`.
- Adapter port `EsgRatingsAdapter` in `src/infra/esg-ratings/` (planned; kernel, imports no module): `searchEntities({ name, country?, ticker?, isin?, lei? })`, `getRating(providerEntityId, month)` → `{ overall, categories, asOf }`, `quota()`. Drivers `csrhub` (HTTP client, timeouts 10 s, no request/response body logging), `fake` (deterministic fixtures for tests/dev), `off`. Env (Zod-validated at boot): `ESG_RATINGS_DRIVER` (default `off`), `CSRHUB_API_KEY`, `CSRHUB_BASE_URL`, `ESG_CSRHUB_ATTRIBUTION`, `ESG_CSRHUB_ALLOW_EXPORT` (default `false`), `ESG_CSRHUB_MAX_CALLS_PER_MONTH`.
- Routes (M26 §8), all behind entitlement `esg_data` + provider switched on (`EsgEnabledGuard`, planned → 403 `feature_disabled`, new `PROBLEM_TYPES` entry):
  - `GET /v1/suppliers/:sid/esg-rating`, `GET /v1/companies/:cid/esg-matches` — `@Can('esg:read')`
  - `POST /v1/esg-matches/:id/{confirm,reject,no-match}`, `GET /v1/esg-provider/search` (rate limit 30/min/workspace) — `@Can('esg:match')`
  - `GET/POST /v1/platform/esg/refresh-runs` — `@Can('platform:*')`, POST with `Idempotency-Key`
- Permissions to add to `PERMISSIONS` and the M01 matrix: `esg:read` (owner, admin, viewer, auditor, partner_admin), `esg:match` (owner, admin, partner_admin); both → module `esg_data` (new entry in M02 `MODULES`).
- Queue `esg-data` (registered in `src/worker.ts`): `match` jobs, monthly repeatable `refresh` (2nd of month 03:00 UTC), `fetchOne` on confirm.
- Constants `EsgEvents` in `events.ts` (planned): `external_rating.updated`, audit actions `esg_match.confirmed|rejected|no_match`, `esg_refresh.run`.

## Public surface (`index.ts`, planned)

| Export                                                                         | Why others need it                                                                                         |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `EsgDataModule`                                                                | Registered in `app.module.ts` / `worker.ts`                                                                |
| `EsgQueries.ratingFor(workspaceId, supplierId)` → `ExternalRatingView \| null` | `dd-reporting` cites the value with provider, month, attribution (and hides it when export is not allowed) |
| Types `ExternalRatingView`, `EsgProvider`                                      | Read models                                                                                                |
| `EsgEvents`                                                                    | `risk` and `monitoring` subscribe by constant                                                              |

## Depends on

| Module                         | Uses                                                                                        | Fake (`__tests__/fakes/`, planned) |
| ------------------------------ | ------------------------------------------------------------------------------------------- | ---------------------------------- |
| `supplier-register`            | `getSupplier`, `listSuppliers` (name, country, identifiers, archived) + `supplier.*` events | `supplier-register.fake.ts`        |
| `workspaces`                   | entitlement `esg_data`; exported query listing entitled workspaces (monthly job)            | e2e seeds kernel tables            |
| `notifications`                | event bus, `notify()` (digest of new suggestions)                                           | `notifications.fake.ts`            |
| `audit`                        | `AuditService.record`                                                                       | real module                        |
| M13 feature flags (when built) | `isEnabled('esg_data.csrhub', workspaceId)` in `EsgEnabledGuard`                            | — until built, env switch only     |

## Events

- Emits `external_rating.updated` `{ workspaceId, supplierId, provider, providerEntityId, month, overall, categories, asOf }` — after a confirm (that workspace only) and after each monthly fetch (every workspace with a confirmed match to the entity).
- Consumes `supplier.created` / `supplier.updated` (payloads carry no name: read `SupplierRegisterService.getSupplier` when `changed[]` includes name or country) → upsert `esg_subjects`; when `subject_hash` changes, enqueue `match` (a confirmed match is kept, flagged `check` if the country changed). `supplier.archived` → excluded from refresh.

## Components & behaviour

- `engine/match.ts` (planned, pure) — `normaliseName`, `strength(subject, entity)`, `rankCandidates(subject, entities, max = 5)` per M26 §7.1. Never returns "confirmed": confirmation is always a person.
- `esg-match.processor.ts` (planned) — for a subject: search the cache, then the provider; store candidates → status `suggested` or `no_match`.
- `esg-refresh.processor.ts` (planned) — monthly run: distinct confirmed entities across entitled workspaces via the audited cross-tenant repository method `listConfirmedEntitiesForRefresh()` (never by disabling RLS); one provider call per entity per month (skip if cached); retries with exponential backoff (5 attempts); on quota exhaustion pause until next day; records `esg_refresh_runs`; emits events per workspace inside `withTenant`.
- `esg-data.service.ts` (planned) — confirm / reject / no-match with optimistic check (`409 conflict` if already decided), audit entry, `fetchOne` enqueue; rating read model adds `stale` (> 3 months old) and `attribution`.
- `esg-data.repository.ts` (planned) — only Prisma access; tenant queries in `prisma.withTenant`; cache tables accessed only here.
- `esg-data.controller.ts` (planned) — HTTP only.

## Invariants

- No provider call from the request path except `GET /esg-provider/search` (rate-limited, cached); everything else runs in the worker.
- At most one provider rating call per (provider, entity, month).
- Every value leaving the module carries `provider`, `month`, `asOf` and `attribution`; exports omit the value when `ESG_CSRHUB_ALLOW_EXPORT=false`.
- A match is only `confirmed` by a user action, audited with actor and time.
- This module computes no risk: it publishes the rating; `risk/engine` decides its weight.
- No AWS, no provider SDK outside `src/infra/esg-ratings/`; API key never logged.

## Tests

- Unit: `engine/match.spec.ts`, `engine/match.property.spec.ts` (US-26-1); adapter contract tests against `fake` and a recorded `csrhub` stub (no live calls in CI).
- E2e (planned): `test/esg-data-matching.e2e-spec.ts` (US-26-1, US-26-2), `test/esg-data-refresh.e2e-spec.ts` (US-26-3, US-26-4, US-26-6), `test/esg-data-access.e2e-spec.ts` (US-26-5 entitlement/provider off, US-26-7 RLS + 404 cross-workspace, forbidden role).

## Not here

Risk weighting of the rating (`risk`), supplier records and identifiers (`supplier-register`), report layout (`dd-reporting`), entitlements management (`workspaces`), feature-flag storage (M13).
