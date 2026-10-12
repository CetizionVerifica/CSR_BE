# Screening & ranking (M10 §7 · SD07)

> Spec: `docs/revamp/modules/M10-supply-chain.md` §7 (contract §14.1 screening) · Status: Draft · Wave: 4

## Purpose

Ranks and screens a buyer company's suppliers for a reporting year, server-side: score per supplier at the chosen level (overall, core subject, issue), tiers A–D, conforming / non-conforming / high concern tables, filters (year, region, country, sector, category, impact, supply tier, risk band), the yearly trend, and immutable **ranking runs** so the XLSX export and the PDF report show exactly the same numbers. Replaces the legacy browser-only ranking (fixes the impact filter and issue-level screening bugs).

## Owns

- Tables (`workspace_id`, RLS `ENABLE` + `FORCE`; FKs only to `workspaces`, `companies`, `users`):
  - `screening_settings` `{ workspace_id pk, tier_a_min 75, tier_b_min 50, tier_c_min 25, default_range_min 50, default_range_max 100, updated_by, updated_at }`
  - `screening_runs` `{ id, workspace_id, company_id, year, params jsonb, settings jsonb (snapshot), totals jsonb, engine_version, created_by, created_at }` — immutable
  - `screening_results` `{ run_id, workspace_id, supplier_id uuid, supplier_name, country_code, region_code, sector_code, category_code, supply_tier, criticality, impact, score numeric(5,2)?, node_scores jsonb, score_source, tier?, conformity, high_concern, high_concern_reasons text[], risk_band?, residual_risk?, rank? }` — snapshot copies, immutable
  - `screening_saved_filters` `{ id, workspace_id, user_id, company_id, name, params jsonb }`
- Routes (entitlement `ranking`; `:cid` buyer company of the current workspace, else 404):
  - `GET /v1/companies/:cid/screening?year=&level=&nodes=&rangeMin=&rangeMax=&region=&country=&sector=&category=&impact=&supplyTier=&riskBand=&verifiedOnly=&table=&cursor=` — live result (not persisted) — `@Can('supplier:rank')`
  - `GET /v1/companies/:cid/screening/trend?fromYear=&toYear=&…filters` — `@Can('supplier:rank')`
  - `POST /v1/companies/:cid/screening-runs` (same params; `Idempotency-Key`) → 201 run · `GET /v1/screening-runs/:id` · `GET /v1/screening-runs/:id/results?table=&cursor=` · `GET /v1/companies/:cid/screening-runs?cursor=` — `@Can('supplier:rank')`
  - `GET /v1/screening-runs/:id/export.xlsx` (streamed) — `@Can('supplier:rank')`
  - `GET/PUT /v1/workspaces/current/screening-settings` — `@Can('supplier:rank')` / `@Can('supplier:manage')`
  - `GET/POST/DELETE /v1/companies/:cid/screening-filters[/:id]` — `@Can('supplier:rank')` (own filters only)
- Permissions: existing `supplier:rank` (→ module `ranking`) and `supplier:manage` (M01 §2); no new permission.
- Event constants `ScreeningEvents` in `events.ts` (planned): `screening.completed`, audit `screening_settings.updated`, `screening_run.exported`.
- i18n of XLSX headers from `src/locales/<lng>/screening.json` (server-side, planned).

## Public surface (`index.ts`, planned)

| Export                                                                                                               | Why others need it                                                   |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `ScreeningModule`                                                                                                    | Registered in `app.module.ts`                                        |
| `ScreeningQueries.run(workspaceId, runId)` → `ScreeningRunView` (params, totals, results, trend)                     | `dd-reporting` renders the ranking PDF from the same run as the XLSX |
| `ScreeningQueries.latestTierFor(workspaceId, supplierIds, year)` → `{ supplierId, tier, conformity, highConcern }[]` | `dd-reporting` (tier per supplier in reports); monitoring later      |
| Types `ScreeningRunView`, `ScreeningTier`, `Conformity` · `ScreeningEvents`                                          | Read models and event constant                                       |

## Depends on

| Module                                       | Uses                                                                                                                                                                                                        | Fake (`__tests__/fakes/`, planned) |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `supplier-register`                          | `SupplierRegisterService.listSuppliers(workspaceId, filter)` / `getSuppliersByIds`: name, country, sector, category, criticality, spend band, supply tier, compliance, high-concern flag + reason, archived | `supplier-register.fake.ts`        |
| `supplier-portal`                            | `SupplierAccessService.accessFor(buyerWorkspaceId, supplierId, year)` → `none \| status_only \| full_results`; `assertCanView(ctx, …)` audits each shared-data read (ISO 26000 results only)                | `supplier-portal.fake.ts`          |
| `questionnaires`                             | `QuestionnaireSummaryQuery.latestAcceptedForSuppliers(workspaceId, supplierIds, { year })` (M21 §14)                                                                                                        | `questionnaires.fake.ts`           |
| M05 gap results (ISO 26000 deep tier, later) | planned exported query `supplierResultsFor(buyerWorkspaceId, supplierIds, year)` → overall / core subject / issue scores + `verified`; until it exists the ISO source is absent                             | `gap-results.fake.ts`              |
| `risk`                                       | `RiskQueries.risksFor(workspaceId, supplierIds)` → residual + band                                                                                                                                          | `risk.fake.ts`                     |
| `reference-data`                             | regions, sectors, categories, ISO 26000 core subjects/issues (labels, fixed order)                                                                                                                          | `reference-data.fake.ts`           |
| `notifications`                              | `EventBus.publish` for `screening.completed` (fake `notifications.fake.ts`)                                                                                                                                 |
| `audit`                                      | `AuditService.record`                                                                                                                                                                                       | real module                        |

## Events

- Emits `screening.completed` `{ workspaceId, companyId, runId, year, totals: { assessed, conforming, nonConforming, highConcern, byTier } }` when a run is persisted (no consumer in v1: dd-reporting reads runs on demand).
- Consumes: none (reads current data through the queries above at request time; runs freeze it).

## Components & behaviour

- `engine/` (planned, pure, `ENGINE_VERSION = 'screening-1'`; rules M10 §7):
  - `scoreFor(supplierData, level, nodes)` — source precedence: ISO 26000 verified (access `full_results`, round completed) → ISO 26000 self-assessed (shared) → questionnaire score = mean of the latest accepted `scoreOverall` per template accepted in the reporting year (overall level only; the buyer's own data, no access row needed); `status_only` exposes the ISO overall only; level score = mean of the selected nodes; a missing selected node → `not_assessed` at that level.
  - `tierOf(score, settings)` — A ≥ 75, B ≥ 50, C ≥ 25, else D (inclusive lower bounds, per-workspace thresholds).
  - `conformityOf(nodeScores, range)` — conforming ⇔ every selected node (or overall) within `[min, max]` inclusive; at issue level **issue** scores are checked (legacy bug fix).
  - `impactOf(supplier, population)` — criticality when set; else spend-band tertile over the buyer's suppliers with a spend band (ascending ordinal, average rank for ties, `r/n ≤ 1/3` low, `≤ 2/3` medium, else high); else `unknown`. The impact filter applies this value (legacy bug fix).
  - `highConcernOf(...)` — flag set OR (non-conforming AND criticality high) OR compliance `non_compliant`; reasons listed.
  - `rank(results)` — score desc, ties share the rank (1, 2, 2, 4), ordered by normalised name then id; `not_assessed` unranked, listed last.
  - `trend(yearly)` — per year: mean overall score of suppliers with data, % conforming at the default range; years without data `null`.
  - Rounding: half-up to 1 decimal for scores and means, once at the end.
- `screening.service.ts` (planned) — gathers data through the dependencies, filters, calls the engine; `createRun` persists params, settings snapshot, results and totals in one transaction and emits `screening.completed`. Live and run results come from the same code path, so a run made with the screen's params equals the screen.
- `screening-export.service.ts` (planned) — streams the run to XLSX (sheets Ranking, Conforming, Non-conforming, High concern, Trend, Parameters), headers in the requested locale, numbers as numbers with 1 decimal format. Audit `screening_run.exported`.
- `screening.repository.ts` (planned) — only Prisma access, inside `prisma.withTenant`; runs and results never updated or deleted (retention purge excepted).
- PDF: not rendered here — `dd-reporting` renders report type `screening_ranking` from `ScreeningQueries.run(runId)` (`POST /v1/dd/reports`, `dd_report:export`).

## Invariants

- A buyer never sees supplier results without a granted access for that year (`supplier-portal` decides); a revoked access drops detail from new runs, existing runs keep only the buyer's own fields + the score that was visible when the run was made (documented in M10 §7).
- Scores, tiers, conformity, impact and ranks are computed only in `engine/`; the client sends filters, never numbers.
- XLSX and PDF of a run show identical numbers (both read the stored run); the export includes run id, timestamp, parameters and `engine_version`.
- "Tier A–D" (screening grade) is never confused with "supply tier" (direct/sub-supplier): different field names and labels.

## Tests

- Unit: `engine/*.spec.ts` (tiers incl. boundaries 25/50/75, ranges, levels, issue-level fix, impact tertiles incl. ties and missing spend band, high concern, rank ties, missing data, source precedence), `engine/screening.property.spec.ts`.
- E2e (planned): `test/screening-ranking.e2e-spec.ts` (US-10-3), `test/screening-runs-export.e2e-spec.ts` (US-10-4: XLSX numbers = run = live screen), `test/screening-settings.e2e-spec.ts` (US-10-5), `test/screening-access.e2e-spec.ts` (no granted access → no supplier data; forbidden role; entitlement `ranking` missing → 403; other workspace → 404; RLS).

## Not here

Supplier records (`supplier-register`), sharing and visibility (`supplier-portal`), questionnaire scoring (`questionnaires`), risk scores (`risk`), PDF rendering and report storage (`dd-reporting`), alerts on tier changes (`monitoring`).
