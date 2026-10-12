# M22 — Supplier risk (inherent and residual risk engine)

> Status: Draft · Phase: B (due diligence) · Depends on: M13 (`reference-data`: country and sector risk indices, categories, regions), M19 (`supplier-register`); consumes events of M21 (`questionnaires`), M14 (`supplier-evidence`), M23 (`dd-audits`), M09 (`corrective-actions`), M26 (`esg-data`) · Blocks: M10 §7 (`screening`), M24 (`monitoring`), M11/M16 (`dd-reporting`)
> Legacy code: none (new in the revamp; M10 §4.2 "Risk scoring" bullet). Plan item SD06.

## 1. Purpose

Give a buyer one defensible, explainable risk score per supplier so that due diligence effort goes where the risk is (LkSG §5 risk analysis, CSDDD Art. 8): an **inherent risk** from where the supplier operates, what it does and how much the buyer depends on it, and a **residual risk** after what the buyer knows about the supplier (questionnaire, verified evidence, audits, corrective actions and, optionally, an external ESG rating shown as a separate factor). Procurement leads and compliance officers use it to prioritise suppliers; auditors use the factor breakdown and history to see why a score is what it is.

## 2. Users & permissions

| Role | Can |
| --- | --- |
| workspace_owner, workspace_admin, partner_admin (procurement lead, compliance officer) | Read all risk views (`risk:read`), change the workspace risk settings and request a recompute (`risk:configure`) |
| viewer, auditor | Read risk views, factor breakdown and history (`risk:read`) |
| contributor | — |
| supplier workspaces | Never see the buyer's risk score (it is the buyer's internal assessment) |

Both permissions need the entitlement module `due_diligence` (M01 §2 table, M02 §4.1). New M01 matrix rows: `risk:read` (owner, admin, viewer, auditor, partner_admin, platform_owner), `risk:configure` (owner, admin, partner_admin, platform_owner).

## 3. Current state (legacy)

No risk scoring exists. Legacy only has a manual `high concern` flag and a `compliance` status on off-platform suppliers (`externalSuppliers`), and ranks suppliers by self-assessed gap scores in the browser (M10 §3).

## 4. Scope

### 4.1 Must have

- **Inherent risk** per supplier = country risk index × sector risk × criticality, normalised to 0–100 (§7.1), from licensed or open reference indices held by `reference-data` (M13).
- **Residual risk** = inherent risk after mitigation facts (latest accepted questionnaire scores, verified valid certificates, latest audit result) and aggravation facts (questionnaire critical flags, open audit findings, overdue corrective actions), §7.2.
- **External ESG rating** (M26, optional) shown as a **separate factor** with source and date; it moves the residual score only when the workspace sets a weight > 0 (default 0).
- **Bands** Low 0–39 · Medium 40–64 · High 65–100 (02 §9.3), configurable per workspace, returned by the API with every score; the frontend never derives a band.
- **Drivers**: each score carries its factor breakdown and the top drivers in points (§7.3), so every number is explainable.
- **History**: append-only record of every change of a supplier's score, plus a monthly workspace snapshot for the 12-month risk trend.
- **Read models**: supplier risk, batch scores for the supplier register and screening, heat map (category × region), risk by category, 12-month trend, top drivers.
- Facts arrive **only through events or exported queries** (06 §5): risk never reads another module's tables.

### 4.2 New in the revamp

Everything above (no legacy equivalent).

### 4.3 Out of scope

- Sanctions and adverse-media screening, reassessment cycles, alerts and the signal feed (`monitoring`, M24); risk only links to the feed.
- Choosing which suppliers to audit or send questionnaires to (the user decides; `questionnaires`, `dd-audits`).
- Supplier-side view of the buyer's risk score.
- Machine-learned scoring; any formula change goes through this spec and a new `engine_version`.

## 5. User stories & acceptance criteria

- **US-22-1** As a procurement lead I want every supplier to get an inherent risk score as soon as it has a country, sector and criticality, so that I can prioritise before I know anything else.
  - AC: Given a supplier in a country with index 80, sector risk 70 and criticality high, when it is saved, then within one worker cycle `GET /suppliers/:id/risk` returns `inherent = 82`, band `High`, and the three inherent factors with their source index and year.
- **US-22-2** As a compliance officer I want the residual risk to drop when the supplier submits a good questionnaire and verified certificates, and to rise with open critical findings or overdue corrective actions, so that the score reflects what we know.
  - AC: Given inherent 82 and no facts, when a questionnaire response with score 80 and no critical flags is accepted, then residual = 59 (Medium); when a critical finding is then raised, residual = 74 (High); when its CAP is closed, residual returns to 59.
- **US-22-3** As a user I want missing data to be visible and conservative, so that an unknown supplier never looks safe.
  - AC: Given a supplier with no country, then the country factor uses the workspace's missing-data default (70), the factor is flagged `missing`, and the risk view lists it under "Missing data".
- **US-22-4** As a compliance officer I want to see a heat map of risk by category and region and click a cell to see those suppliers.
  - AC: Given suppliers in 3 categories and 2 regions, `GET /companies/:cid/risk/heatmap` returns one cell per category × region with supplier count and mean residual; clicking a cell opens the supplier register filtered by that category and region.
- **US-22-5** As an auditor I want the history of a supplier's risk with the reason for each change.
  - AC: Each change appends a history row with previous and new score, band, trigger (event name or settings change) and `engine_version`; `GET /suppliers/:id/risk/history` returns them newest first.
- **US-22-6** As a procurement lead I want an external ESG rating, when we have one, shown as a separate factor with its source and date, so that I can judge it myself.
  - AC: Given an `external_rating.updated` with overall 62 from CSRhub for 2026-09 and the workspace weight 0, then the factor appears with "CSRhub · Sep 2026" and the residual is unchanged; with weight 0.15 the residual is recomputed by §7.2.
- **US-22-7** As an admin I want to change the band thresholds and missing-data defaults of my workspace, and have every score recomputed.
  - AC: `PUT /workspaces/current/risk-settings` with medium 35 / high 60 is accepted, writes an audit event, enqueues a recompute of every supplier and the bands in all read models change; medium ≥ high answers 400 `validation_failed`.
- **US-22-8** As a user I want the 12-month risk trend and the risk by category on the risk view, with the same numbers in "View as table".
  - AC: `GET /companies/:cid/risk/trend` returns 12 monthly points (mean residual of active suppliers at month end, current month live); the chart's table view lists the same values.
- **US-22-9** Another workspace never sees or changes my risk data.
  - AC: Every risk route with another workspace's supplier or company id answers 404; RLS isolation test passes for all risk tables.

## 6. Domain model

All tables tenant-owned: `workspace_id`, RLS `ENABLE` + `FORCE` with `app_current_workspace()`, UUIDv7 ids, `numeric` for scores and factors. Supplier and company ids are plain `uuid` (companies is a kernel table: FK allowed; suppliers belong to `supplier-register`: no FK).

```ts
risk_settings     { workspace_id pk → workspaces, band_medium_min int default 40, band_high_min int default 65,
                    missing_country numeric(5,2) default 70, missing_sector numeric(5,2) default 70,
                    missing_criticality text default 'medium', external_weight numeric(3,2) default 0,   -- 0 … 0.15
                    questionnaire_validity_months int default 24, audit_validity_months int default 36,
                    updated_by → users, updated_at }
risk_subjects     { id, workspace_id, supplier_id uuid unique(workspace_id, supplier_id), company_id → companies,
                    country_code?, region_code?, sector_code?, category_code?, criticality?, supply_tier?,
                    archived boolean, source_version int, updated_at }      -- copy of the supplier attributes risk needs,
                                                                             -- written only from supplier.* events / getSupplier
risk_facts        { id, workspace_id, supplier_id uuid, kind: 'questionnaire'|'certificate'|'audit'|'finding'|'cap'|'suspension'|'external_rating',
                    source_ref uuid, unique(workspace_id, kind, source_ref), payload jsonb, status: 'active'|'superseded'|'closed',
                    occurred_at, valid_until?, received_at }                -- idempotent upsert per event
supplier_risk     { workspace_id, supplier_id uuid pk(workspace_id, supplier_id), company_id → companies,
                    inherent int, residual int, band: 'low'|'medium'|'high', inherent_band, factors jsonb, drivers jsonb,
                    missing text[], category_code?, region_code?, archived boolean, engine_version text, computed_at }
supplier_risk_history { id, workspace_id, supplier_id uuid, inherent int, residual int, band, previous_residual int?, previous_band?,
                    trigger text, factors jsonb, engine_version, computed_at }       -- append-only, index (workspace_id, supplier_id, computed_at desc)
risk_snapshots    { workspace_id, company_id → companies, month date, pk(workspace_id, company_id, month),
                    mean_residual numeric(5,2), suppliers int, by_band jsonb { low, medium, high }, by_category jsonb, created_at }
```

Indexes: `supplier_risk (workspace_id, company_id, band)`, `(workspace_id, company_id, category_code, region_code)`; `risk_facts (workspace_id, supplier_id, kind, status)`.

## 7. Business rules & calculations

All formulas live in `src/modules/risk/engine/` as pure functions (no I/O), versioned by `ENGINE_VERSION` (`risk-1`). The part card `src/modules/risk/engine/CLAUDE.md` repeats them with edge cases for the builder.

### 7.1 Inherent risk

Inputs (all from `reference-data` and the supplier's attributes):

- `C` = country risk index of the supplier's country for the latest published year, 0–100 (higher = riskier). Missing country or no index value → `settings.missing_country`, flagged `missing: 'country'`.
- `S` = sector risk of the supplier's sector, 0–100. Missing → `settings.missing_sector`, flagged `missing: 'sector'`.
- `K` = criticality weight: low = 1/3, medium = 2/3, high = 1. Missing → `settings.missing_criticality`, flagged.

```
c = clamp(C, 1, 100) / 100        s = clamp(S, 1, 100) / 100
inherent_raw = 100 × (c × s × K)^(1/3)          -- geometric mean keeps "×" semantics on a 0–100 scale
inherent     = round_half_up(inherent_raw)      -- integer 0–100
```

The geometric mean is used instead of the bare product so that three medium factors do not collapse into a low score (60 × 60 × medium → 62, not 24). Inputs are floored at 1 so that a single 0 does not hide the other factors. Example: C 80, S 70, high → (0.8 × 0.7 × 1)^(1/3) = 0.824 → 82.

### 7.2 Residual risk

Active facts per supplier (from `risk_facts`, status `active`, within validity):

| Factor | Fact | Multiplier / points |
| --- | --- | --- |
| Questionnaire | `q` = mean of the latest **accepted** `scoreOverall` per template (0–100, higher = better), each accepted within `questionnaire_validity_months` | `m_q = 1 − 0.35 × q/100` |
| Evidence | `n` verified certificates with `valid_until ≥ today` | `m_e = 1 − min(0.20, 0.10 × n)` |
| Audit | Latest completed audit (by `completedAt`, `source ≠ 'legacy_flag'`) not older than `audit_validity_months`, result `pass` / `pass_with_findings` / `fail` (M23 §7.4; external audits count with their entered result) | `m_a = 0.75` / `0.90` / `1.00` |
| External rating | Latest `external_rating` overall `r` (0–100, higher = better), only if `external_weight w > 0` | `m_x = 1 − w × r/100` |
| Open findings | Open `critical` finding: +15 each; open `major`: +5 each | aggravation `A_f = min(30, Σ)` |
| Overdue CAPs | Each corrective action plan with at least one overdue action (distinct `capId`) | aggravation `A_c = min(20, 10 × n)` |
| Questionnaire critical flags | Distinct critical flags (M21 §7.2) on the accepted responses used for `q` | aggravation `A_q = min(20, 10 × n)` |
| Suspension | Latest `cap.suspension_decided` is `suspend` | shown as a factor, 0 points (informational in `risk-1`) |

```
m = max(0.40, m_q × m_e × m_a × m_x)            -- missing fact → multiplier 1
residual = clamp(round_half_up(inherent × m + A_f + A_c + A_q), 0, 100)
```

- With no facts, residual = inherent.
- The mitigation floor 0.40 means paperwork alone can never cut risk by more than 60%.
- Aggravations may push residual above inherent (bad news is visible).
- A finding stops counting when `finding.withdrawn` or `finding.closed` names it or a `cap.closed` lists it in `findingIds`; a CAP stops counting as overdue on `cap.closed` or `cap.cancelled`.
- A certificate stops counting on `certificate.expired`, `certificate.rejected` or `certificate.superseded` for its `documentId` (and in any case after `valid_until`).
- Example (US-22-2): inherent 82, q 80 → m 0.72 → 59.04 → 59; + critical finding → 74.

### 7.3 Bands and drivers

- `band(score)` = `high` if score ≥ `band_high_min`, `medium` if ≥ `band_medium_min`, else `low`. Defaults 40 / 65 (02 §9.3). Constraint: `0 < medium_min < high_min ≤ 100`. Every response carries `bands: { mediumMin, highMin }`.
- Drivers, in points (integer, signed), sorted by `|points|` desc, ties by factor code:
  - inherent factor `f`: `inherent − inherent(with f neutral)`, neutral = 50 for C and S, medium for K;
  - mitigation `i`: its share `inherent × (1 − m_i)`, scaled so all mitigation points add up to the reduction actually applied, `inherent × (1 − m)` (product and floor included), rounded by largest remainder, negative;
  - aggravations: `+A_f`, `+A_c`.
- "Top drivers" (risk view) for a set of suppliers = the 3 factor codes with the largest mean `|points|` across the set, with how many suppliers each affects.

### 7.4 Read models

- **Heat map**: rows = categories in reference-data order (`uncategorised` last), columns = regions in reference-data order (`unknown` last); cell = `{ suppliers, meanResidual (1 decimal), band(meanResidual rounded) }`; empty cells have `suppliers = 0` and no value. Archived suppliers excluded.
- **Risk by category**: same rows, mean residual and supplier count per band; fixed order, never sorted by value (02 §9.4).
- **Trend**: last 12 months from `risk_snapshots` (written on the 1st of each month for the month that ended) + current month computed live; months without suppliers are `null`, not 0.

### 7.5 Recompute

- Triggers: `supplier.created|updated` (only when country, sector, category, criticality or archive status changed), every consumed fact event, `reference.updated` for a risk index or sector risk table (all workspaces, batched), settings change (whole workspace), nightly sweep at 02:00 UTC (facts that expired: questionnaire/audit validity, certificate `valid_until`), manual `POST …/risk:recompute`.
- Recompute runs in the `risk` BullMQ queue, one job per (workspace, supplier), deduplicated by job id; the request path only enqueues.
- A history row is appended and `supplier.risk.changed` emitted only when `inherent`, `residual`, `band` or the set of factor codes changes.

## 8. API contract (REST `/v1`)

All routes need entitlement `due_diligence`; `:cid` is a buyer company of the current workspace, `:sid` a supplier of it (else 404).

| Route | Permission | Returns |
| --- | --- | --- |
| `GET /suppliers/:sid/risk` | `risk:read` | `{ status: 'computed' | 'pending', supplierId, inherent, residual, band, inherentBand, bands, factors[], drivers[], missing[], engineVersion, computedAt }`; a supplier not yet computed answers 200 with `status: 'pending'` (never 404) |
| `GET /suppliers/:sid/risk/history?cursor=` | `risk:read` | history rows, newest first, cursor pagination |
| `POST /suppliers/:sid/risk:recompute` | `risk:configure` | 202 (enqueued), `Idempotency-Key` |
| `GET /companies/:cid/risk/scores?supplierIds=&band=&cursor=` | `risk:read` | batch `{ supplierId, inherent, residual, band, previousResidual, delta }[]` for the register's risk meter, "change since last period" column (`delta` = residual − residual at the end of the previous month, from history; `null` when none) and filters (≤ 200 ids) |
| `GET /companies/:cid/risk/summary` | `risk:read` | `{ suppliers, byBand, highRiskDelta (vs previous month), missingData }` for stat tiles |
| `GET /companies/:cid/risk/heatmap` | `risk:read` | `{ rows[], columns[], cells[], bands }` §7.4 |
| `GET /companies/:cid/risk/by-category` | `risk:read` | `{ categories[{ code, meanResidual, band, byBand }], bands }` |
| `GET /companies/:cid/risk/trend?months=12` | `risk:read` | `{ points[{ month, meanResidual, suppliers }], bands }` |
| `GET /companies/:cid/risk/drivers?category=&region=` | `risk:read` | top 3 drivers §7.3 |
| `GET /workspaces/current/risk-settings` | `risk:read` | settings + defaults |
| `PUT /workspaces/current/risk-settings` | `risk:configure` | updated settings; 400 `validation_failed` on bad thresholds |

Errors are problem+json (`not_found`, `validation_failed`, `entitlement_required`, `forbidden`).

## 9. UI

Calm Ledger (02 §9). Namespace `risk`. Nav: "Risk" in the "Due diligence" group (`risk:read`, module `due_diligence`; non-entitled → locked-module panel).

- **`/risk` — Risk view** (02 §9.5 "Risk view"): page header with company context; row of 3 `StatTile`s (high-risk suppliers with delta vs last month, mean residual, suppliers with missing data); **Risk heat map** (02 §9.4, category × region, value in every cell, click → `/suppliers?category=&region=`) with the **Top drivers** panel beside it (stacks below on narrow screens); then **Risk by category** and **Risk trend** side by side; then a link card "Signal feed" to the monitoring feed (`/monitoring`, Signals tab; shown only when the `monitoring` feature is in the router and the user has `monitoring:read`). Risk never imports the monitoring feature.
  - Loading: skeletons shaped like each card. Empty (no suppliers with risk): explains what risk is computed from + CTA "Add suppliers" (link to the register). Error: per-card `ErrorState` with retry; one failing card never blanks the page.
- **`/suppliers/:supplierId/risk` — Supplier risk tab** (child route composed into the M19 supplier detail through `supplierDetailRoute(extraTabs)` in the router): `RiskMeter` for inherent and residual with band label, factor breakdown table (factor, value, source and date, points), drivers list, external rating factor (when present, "source · month"), missing-data notice, supplier risk trend (line), history table (DataTable, cursor). Pending computation shows "Calculating…" with polite live region.
- **`/settings/risk` — Risk settings** (`risk:configure`; read-only for `risk:read`): band thresholds, missing-data defaults, validity months, external-rating weight (disabled with explanation when `esg-data` is not entitled). Save → confirm dialog "All scores will be recomputed".
- Motion: one entrance per view (`--motion-enter` for cards, `--motion-grow` for meters and bars, `--motion-draw` for trend lines); refetches update in place; reduced motion renders final values.
- Charts through `ResiliChart` with "View as table" and downloads; risk colours only from `--risk-*` tokens, label + number always visible.

## 10. Events, notifications & audit

- Emits `supplier.risk.changed` `{ workspaceId, companyId, supplierId, inherent, residual, band, previousResidual, previousBand, trigger, computedAt }` (consumer: `monitoring`; `screening` and `dd-reporting` read `RiskQueries` instead).
- Consumes: `supplier.created|updated|archived|restored` (M19), `questionnaire.reviewed` with `decision = 'accepted'` (M21; `questionnaire.submitted` is not used, unreviewed scores do not lower risk), `certificate.verified|expired|rejected|superseded` (M14 §10.7 `supplier-evidence`), `dd_audit.completed`, `finding.raised`, `finding.withdrawn`, `finding.closed` (M23), `cap.overdue`, `cap.closed`, `cap.cancelled`, `cap.suspension_decided` (M09 `corrective-actions`), `external_rating.updated` (M26), `reference.updated` (M13).
- Audit: `risk_settings.updated` (diff), `risk.recompute_requested`.
- Notification: risk calls `NotificationService.notify()` itself (in-app + email to `risk:configure` holders, category `due_diligence`) when a supplier's residual band becomes High.

## 11. Migration from legacy

Nothing to migrate. After `supplier-register` migrates legacy suppliers, a one-off job computes inherent risk for all of them; legacy `highConcern` is not a risk input (it stays a screening input, M10 §7).

## 12. Test plan

- Engine: table-driven tests for §7.1–§7.3 including band boundaries (39/40, 64/65 and custom thresholds), floors (C = 0, S = 0), all-missing inputs, mitigation floor, aggravation caps, rounding half-up at .5, external weight 0 vs 0.15; property-based tests (`engine/*.property.spec.ts`): scores always integers in 0–100, residual = inherent with no facts, adding a mitigation never raises residual, adding an aggravation never lowers it, band monotonic in score. Golden fixtures in `test/fixtures/golden/risk/`.
- Service/e2e (`test/risk-*.e2e-spec.ts`): event → recompute → read model; idempotent duplicate events; settings change recomputes; forbidden role; entitlement missing → 403; other workspace → 404; RLS isolation for every table.
- Frontend: MSW page tests for loading/empty/error per card, heat-map keyboard navigation and cell click, table views, axe on `/risk`.

## 13. Open questions

- **Which country index licence?** Recommended: start with a platform-maintained composite from openly licensed sources (e.g. World Bank Worldwide Governance Indicators, CC BY 4.0) loaded into `reference-data`, and add a licensed index (e.g. human-rights or corruption indices) when the owner signs a licence; the engine only needs "index value 0–100 per country and year".
- **Sector risk source?** Recommended: a platform-curated table of sector risk 0–100 in `reference-data`, reviewed by the content team, versioned like other content (M13 §3.2).
- **Factor weights (0.35, 0.10/0.20, 0.75/0.90, caps 30/20, floor 0.40) — fixed or per workspace?** Recommended: fixed platform values in `risk-1`, revisited with pilot data; only bands, missing defaults, validity and the external weight are per workspace.
- **Should sanctions or adverse-media hits (monitoring) force residual to High?** Recommended: yes in a later engine version, as an aggravation fact from `monitoring`'s `watchlist.match_confirmed` (`kind: 'sanctions'`); out of `risk-1`.
- **Do suppliers ever see their buyer's risk score?** Recommended: no (internal assessment); suppliers see their own questionnaire and CAP status only.

## 14. Module contract

Folder: `src/modules/risk/` · `src/features/risk/` · Wave: 2 for the pure `engine/`, 3 for the service, read models and UI.

| | |
| --- | --- |
| Owns | Tables `risk_settings`, `risk_subjects`, `risk_facts`, `supplier_risk`, `supplier_risk_history`, `risk_snapshots`; routes `/v1/suppliers/:sid/risk*`, `/v1/companies/:cid/risk/*`, `/v1/workspaces/current/risk-settings`; permissions `risk:read`, `risk:configure` (module `due_diligence`); BullMQ queue `risk`; i18n namespace `risk`; FE routes `/risk`, `/suppliers/:supplierId/risk`, `/settings/risk` |
| Public surface (`index.ts`) | `RiskModule`; `RiskQueries.riskOf(workspaceId, supplierId)` and `RiskQueries.risksFor(workspaceId, supplierIds)` → `SupplierRiskView` (screening filters and columns, dd-reporting, monitoring); `RiskQueries.heatmap(workspaceId, companyId)` → `RiskHeatmapView` (dd-reporting); types `SupplierRiskView`, `RiskBand`, `RiskBands`, `RiskHeatmapView`; `RiskEvents` (`supplier.risk.changed`); pure `bandOf(score, bands)` (formatting reports with the same thresholds) · FE: `riskRoutes`, `supplierRiskRoute` (tab child for M19 `supplierDetailRoute(extraTabs)`, composed in the router). The DD dashboard (dd-reporting) draws `RiskTrendChart`/`RiskByCategoryChart` from `src/components/charts` with its own API data, so no risk component is exported |
| Depends on | `reference-data`: `ReferenceLookup.countryRiskIndex(countryCode, year?)`, `sectorRisk(sectorCode)`, `categories()`, `regions()`, `regionOf(countryCode)` (to be listed in M13 §14; fake `__tests__/fakes/reference-data.fake.ts`); `supplier-register`: `SupplierRegisterService.getSupplier`, `getSuppliersByIds` (backfill when a subject is missing; fake `supplier-register.fake.ts`); `workspaces`: entitlement check `due_diligence`; `audit`: `AuditService`; `notifications`: `EventBus.publish`, `OnDomainEvent`, `notify()` (fake `notifications.fake.ts`) |
| Emits | `supplier.risk.changed` → `{ workspaceId, companyId, supplierId, inherent, residual, band, previousResidual, previousBand, trigger, computedAt }` |
| Consumes | `supplier.created`/`supplier.updated` (M19 §10 payload: country, sector, category, criticality, tier, `changed[]`) → upsert `risk_subjects`, recompute if a risk attribute changed · `supplier.archived`/`supplier.restored` → exclude/include in read models · `questionnaire.reviewed` `{ supplierId, responseId, templateKey, templateVersion, decision, scoreOverall, criticalFlags, decidedAt }` (accepted only, M21 §10) → questionnaire fact (latest per `templateKey`) · `certificate.verified` `{ supplierId, documentId, certificateTypeCode, validUntil }` → evidence fact; `certificate.expired`/`rejected`/`superseded` → close it · `dd_audit.completed` `{ supplierId, auditId, source, result, completedAt }` → audit fact (`legacy_flag` ignored) · `finding.raised` `{ supplierId, findingId, severity }` → finding fact; `finding.withdrawn`, `finding.closed` → close it · `cap.overdue` `{ supplierId, capId }` → CAP fact; `cap.closed` `{ capId, findingIds[] }` → close CAP and those findings; `cap.cancelled` → close CAP · `cap.suspension_decided` → suspension fact (0 points) · `external_rating.updated` `{ supplierId, provider, month, overall, asOf }` → external fact · `reference.updated` (risk index, sector risk) → batched recompute |
