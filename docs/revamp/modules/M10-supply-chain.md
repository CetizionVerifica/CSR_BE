# M10 — Supply Chain (overview) and supplier screening & ranking

> Status: Draft · Phase: B (screening, SD07, wave 4) · Depends on: M19 (`supplier-register`), M20 (`supplier-portal`), M21 (`questionnaires`), M22 (`risk`), M13 (`reference-data`), M12 (event bus, audit); M05 later (ISO 26000 deep tier) · Blocks: M11 §4.5 (`dd-reporting`: `screening_ranking` report and export)
> Split on 2026-10-12 (06 §5): this spec now holds the **screening & ranking** module (folder `screening`, §7, §14.1) and the overview of supply chain due diligence. Everything else moved to its own spec; the sections below keep one-line pointers so links into M10 still land somewhere.
> Legacy code: BE `schema/mutations/company/{requestSupplier,acceptSupplier,rejectSupplier,removeSupplier,showSupplierResults,requestPartner,acceptPartner,rejectPartner}.js`, `schema/mutations/agency/{suppliers,removePartner}.js`, `mutations/supplierRequest/*`, `controllers/{externalSuppliers,suppliers}.js`, `models/{externalSuppliers,supplierRequest}.js`, `agency.partners[]`, `company.suppliers[]`, `project.supplierProperties[]` → now M19 §11 and M20 §11 · FE `suppliers/*`, `partners/*` → M19/M20 · FE `rankingSystem/**` (ranking + PDF report), `gapAnalysis/SupplierGap.js` → this spec

## 1. Purpose

Let a **buyer** company assess and rank its suppliers' CSR performance — the basis for supply-chain due-diligence obligations (CSDDD, German LkSG, etc.). The due diligence product is split into modules (06 §5):

| Capability | Spec · folder |
|---|---|
| Supplier records, sites, contacts, tiers, import | → M19 · `supplier-register` |
| Invite, link, access requests, sharing levels, "My customers" (terminology My suppliers / My customers → M20 §1) | → M20 · `supplier-portal` |
| Supplier questionnaires (SAQ) | → M21 · `questionnaires` |
| Inherent and residual risk, heat map | → M22 · `risk` |
| Audits and findings | → M23 · `dd-audits` |
| Monitoring, alerts, reassessment cycles, sanctions screening | → M24 · `monitoring` |
| Grievance channel (complaints procedure) | → M25 · `grievances` |
| External ESG ratings (optional) | → M26 · `esg-data` |
| Certificates and supplier documents | → M14 §10 · `supplier-evidence` |
| Corrective action plans | → M09 §4.3, §14.1 · `corrective-actions` |
| DD dashboard, exports, PDF reports, LkSG/CSDDD statements | → M11 §4.5, §14.1 · `dd-reporting` |
| **Ranking & screening** (this spec) | M10 §7, §14.1 · `screening` |

**Screening & ranking** ranks a buyer company's suppliers for a reporting year at the overall, core subject or issue level, screens them against a conformity range, sorts them into tiers A–D and conforming / non-conforming / high-concern tables, shows the yearly trend, and exports the same numbers to XLSX and PDF. It replaces the legacy browser-only ranking.

## 2. Users & permissions

| Role | Can |
|---|---|
| Buyer workspace_owner / workspace_admin / partner_admin (procurement lead) | Rank and screen suppliers, save filters, create runs and export (`supplier:rank`, entitlement `ranking`); edit the workspace screening settings (`supplier:manage`) |
| Buyer contributor / viewer / auditor | Rank and screen when the M01 matrix grants them `supplier:rank` (unchanged) |
| Supplier workspace_admin | → M20 §2 (`customer:share`), M21 §2 (`questionnaire:answer`) |

Supplier list, invites and requests → M19 §2 and M20 §2; questionnaires → M21 §2; risk → M22 §2. No new permission for screening; the PDF goes through `dd-reporting` (`dd_report:export`).

## 3. Current state (legacy)

- Registered supplier flow, partner requests, physical-audit flag and visibility toggles → M20 §3 (buyer-planned audits: M23 §3).
- Unregistered supplier invite dead end → M20 §3.
- Off-platform "Other suppliers" register (`Noncompliant` default, no delete) → M19 §3.
- **Ranking is computed only in the browser** (filters: year, region, country, sector, impact; screening level overall/core subject/issue with % range; tables: Ranking, Conforming, Non-conforming, High concern; yearly trend lines; PDF report via jsPDF). Bugs: the impact filter never matches (condition always true); issue-level screening checks the wrong variable.
- Consent disclaimer and email-only notifications → M20 §3.

## 4. Scope

### 4.1 Must have (parity + fixes)

- Supplier record → M19 §4.1 (documents and certificates → M14 §10).
- Invite → M20 §4.1.
- Access requests & sharing → M20 §4.1, §7.3; the physical-audit flag is supplier-declared there, buyer-planned audits are M23.
- **Supplier results view** (read-only gap results — replaces `SupplierGap`), clearly labelled self-assessed vs verified; stays here until M04/M05 are rebuilt and checks access through M20 `assertCanView`.
- **Ranking & screening engine (server-side, §7; folder `screening`)** with the legacy filters + fixed impact dimension, tables (Ranking, Conforming, Non-conforming, High concern), yearly trend, XLSX export from an immutable run, and a server-rendered PDF report from the same run (`dd-reporting`, M11 §4.5, report type `screening_ranking`).
- "My customers" view → M20 §4.2.

### 4.2 New (roadmap feature #10)

- Supplier questionnaires (SAQ) → M21.
- Risk scoring → M22.
- Corrective action plans → M09 §4.3 (findings → M23).
- Certificate expiry tracking with reminders → M14 §10 (alerts → M24); supplier emissions data request stays with M18.
- Monitoring and sanctions screening → M24; grievances → M25; external ESG ratings → M26.
- **Screening settings** per workspace (tier thresholds, default conformity range) with platform defaults, and saved filters per user.

## 5. User stories & acceptance criteria

- US-10-1 → superseded by US-20-1 and US-20-2 (M20).
- US-10-2 → superseded by US-20-5 (M20).
- **US-10-3** Ranking with filter *impact = high* returns high-criticality suppliers (legacy never matched); screening at issue level uses issue scores.
  - AC: Given suppliers with criticality high, medium and none (spend band only), when I filter `impact=high`, then exactly the suppliers whose engine impact is `high` are listed; at issue level with range 50–100 a supplier is conforming only if every selected issue score is within the range.
- **US-10-4** I export the ranking to XLSX and a branded PDF identical in numbers to the screen.
  - AC: Given the screen's parameters, when I export, then a run is persisted first, the XLSX (`GET /screening-runs/:id/export.xlsx`) and the PDF (`dd-reporting`, `screening_ranking` with that `runId`) read that run, and every score, tier and rank equals the screen's.
- **US-10-5** As a procurement lead, I set my workspace's tier thresholds and default range, so that all rankings and exports follow them.
  - AC: When I `PUT /workspaces/current/screening-settings` with A 80 / B 60 / C 30, new runs use them and old runs keep their settings snapshot; A ≤ B answers 400 `validation_failed`.

## 6. Domain model

- `suppliers` → M19 §6 (its `supplier_workspace_id`, `supplier_company_id`, `invite_*` columns → M20 `supplier_links`).
- `supplier_access` → M20 §6 (plus `supplier_links`, `supplier_consents`, `supplier_profiles`).
- `supplier_documents` → M14 §10.3.
- `supplier_risk` → M22 §6.
- `cap_findings` → findings in M23 `dd_findings`, actions in M09 `cap_actions`.

Screening (folder `screening`; all tables `workspace_id`, RLS `ENABLE` + `FORCE`; FKs only to `workspaces`, `companies`, `users`):

```ts
screening_settings      { workspace_id pk, tier_a_min 75, tier_b_min 50, tier_c_min 25, default_range_min 50, default_range_max 100, updated_by, updated_at }
screening_runs          { id, workspace_id, company_id → companies, year, params jsonb, settings jsonb (snapshot), totals jsonb, engine_version,
                          created_by → users, created_at }                                     -- immutable
screening_results       { run_id → screening_runs, workspace_id, supplier_id uuid (M19, no FK), supplier_name, country_code, region_code,
                          sector_code, category_code, supply_tier, criticality, impact, score numeric(5,2)?, node_scores jsonb, score_source,
                          tier?, conformity, high_concern, high_concern_reasons text[], risk_band?, residual_risk?, rank? }   -- snapshot, immutable
screening_saved_filters { id, workspace_id, user_id → users, company_id → companies, name, params jsonb }
```

## 7. Business rules — ranking engine (`src/modules/screening/engine/`)

- **Supplier score** for year Y at level L (overall / core subject / issue), first available source wins:
  1. ISO 26000 verified (M05 `overall_revised` or revised node scores), when access for Y is `full_results` and the round is completed;
  2. ISO 26000 self-assessed (shared), with a badge; `status_only` exposes the overall score only;
  3. questionnaire score = mean of the latest **accepted** `scoreOverall` per template accepted in Y (M21; the buyer's own data, overall level only).

  The level score is the mean of the selected nodes. A selected node without a score makes the supplier `not_assessed` at that level. `not_assessed` suppliers are listed but not ranked, tiered or counted as conforming or non-conforming.
- **Tier** (screening grade, not the supply tier): A ≥ 75, B ≥ 50, C ≥ 25, D < 25. Lower bounds are inclusive. Thresholds are per workspace (`screening_settings`) with these defaults.
- **Conforming** ⇔ score at the selected level within the selected % range `[min, max]` (inclusive; default 50–100 per workspace). At core subject or issue level, **every** selected node must satisfy the range. At issue level the **issue** scores are checked (fixes the legacy wrong-variable bug).
- **Impact** (fix of the legacy filter that never matched): buyer-set criticality when present. Otherwise a spend-band tertile over the buyer company's suppliers that have a spend band: order the band ordinals ascending and give ties their average rank r of n. `r/n ≤ 1/3` → low, `≤ 2/3` → medium, else high. Otherwise `unknown`. The UI filter, the tables and the export use this same value.
- **High concern** list = `high_concern = true` OR (non-conforming AND criticality high) OR compliance `non_compliant`. The response lists the reasons.
- **Rank**: score desc, rounded half-up to 1 decimal. Equal scores share a rank (1, 2, 2, 4) and are ordered by normalised name, then id.
- **Trend**: per year, the mean overall score of suppliers with data in that year (performance line) and the % conforming at the workspace default range. Years without data are `null`.
- **Runs**: the screen computes live. Exports first persist an immutable run (parameters, settings snapshot, per-supplier results, `engine_version`). XLSX (screening) and PDF (dd-reporting) both read that run, so their numbers are identical, and both equal the screen for the same parameters.
- **Visibility**: a buyer never sees ISO 26000 supplier data without a `granted` access row for that year (`supplier-portal` decides and audits every read). Revocation removes ISO detail from new runs. Existing runs keep the buyer's own fields and the score visible when the run was made. Questionnaire scores the buyer received stay in its history (M21 US-21-8).

## 8. API contract (REST `/v1`)

| Route | Permission |
|---|---|
| Supplier records `/suppliers*`, `/supplier-imports*` | → M19 §8 (no DELETE: archive/restore) |
| Invites and access requests `/suppliers/:id/{invite,access-requests,…}` | → M20 §8 |
| Supplier side `/customers*`, `/supplier-access/:id/{grant,decline,revoke}` | → M20 §8 |
| `GET /suppliers/:id/results?year=` (ISO 26000 supplier results view) | `supplier:read` + M20 `assertCanView` (`full_results` for node scores) |
| `GET /companies/:cid/screening?year=&level=&nodes=&rangeMin=&rangeMax=&region=&country=&sector=&category=&impact=&supplyTier=&riskBand=&verifiedOnly=&table=&cursor=` · `GET /companies/:cid/screening/trend` | `supplier:rank` + entitlement `ranking` |
| `POST /companies/:cid/screening-runs` (`Idempotency-Key`) · `GET /companies/:cid/screening-runs` · `GET /screening-runs/:id` · `GET /screening-runs/:id/results?table=` · `GET /screening-runs/:id/export.xlsx` | `supplier:rank` + entitlement `ranking` |
| `GET /workspaces/current/screening-settings` · `PUT` (tier thresholds, default range) | `supplier:rank` · `supplier:manage` |
| `GET/POST/DELETE /companies/:cid/screening-filters[/:id]` (own saved filters) | `supplier:rank` |
| PDF: `POST /dd/reports { type: 'screening_ranking', companyId, format: 'pdf', params: { runId } }` (dd-reporting, M11 §8) | `dd_report:export` |
| Documents → M14 §10.5 · findings → M23 §8 · CAPs → M09 §8 · SAQ → M21 §8 | — |

## 9. UI

- `/suppliers` register, detail and drawer → M19 §9 (Sharing tab → M20, Evidence → M14 §10.6, Audits → M23, Corrective actions → M09 §9).
- `/suppliers/ranking` (`screening` feature; nav "Ranking" in the "Due diligence" group, `supplier:rank` + module `ranking`): filter bar in one row (year, level, range slider, region, country, sector, category, impact, supply tier, risk band, verified only; URL-synced, saved filters), stat tiles (suppliers assessed, % conforming, high concern), URL-synced tabs Ranking · Conforming · Non-conforming · High concern, ranked bar chart + table with tier badges (letter always visible) and risk badge, trend chart, Export ▾ (XLSX from a run; PDF through `dd-reporting`, shown with `dd_report:export`), "Runs" sheet. Loading skeletons, two empty states (no scores yet → "Send a questionnaire"; no match → "Reset filters"), error with retry, locked-module panel without `ranking`. Calm Ledger motion (02 §9.2).
- `/customers` → M20 §9.

## 10. Events & notifications

- `supplier.invited|linked`, `supplier_access.*` → M20 §10.
- `supplier.assessment.completed` (legacy "ready for supplier ranking" email) → emitted by M05 when rebuilt.
- `supplier_document.expiring` → `certificate.expiring` / `certificate.expired` (M14 §10.7), alerts in M24.
- `cap.overdue` → M09 §10, alerts in M24.
- Screening emits `screening.completed` `{ workspaceId, companyId, runId, year, totals: { assessed, conforming, nonConforming, highConcern, byTier } }` (no consumer in v1: dd-reporting reads runs on demand); audit `screening_settings.updated`, `screening_run.exported`.

## 11. Migration

- `externalSupplier`, `company.suppliers[]`, `agency.partners[]`, `supplierRequest` → M19 §11 (records) and M20 §11 (links and access).
- `project.supplierProperties.physicalAudit` → M20 §11 (`supplier_access.physical_audit`) and M23 §11 (`legacy_flag` audits).
- Screening: nothing to migrate (legacy ranked in the browser); golden fixtures from legacy ranking screens go to `test/fixtures/golden/screening/`.

## 12. Test plan

Ranking engine table tests (tiers incl. boundaries 25/50/75, ranges, levels, impact tertiles incl. ties and missing spend band, high concern, rank ties, missing data, source precedence) and property tests; runs make XLSX = PDF = screen for the same parameters; no granted access → no ISO supplier data; entitlement `ranking` missing → 403; other workspace → 404; RLS for the four screening tables. Cross-workspace visibility and revoke semantics → M20 §12.

## 13. Open questions

- SAQ-BE/SAQ-FE reuse → answered in M21 §13 Q1 (rebuild, import content).
- Licensed country/sector risk indices → M22 §13.
- Tier thresholds and conformity range defaults per buyer or global? → answered: per workspace (`screening_settings`) with platform defaults (US-10-5).
- **Trend "relevance" line.** Legacy names "performance and relevance" lines; the spec uses mean score + % conforming. _Recommended: verify against legacy `rankingSystem/**` before the build and keep parity if the relevance line is meaningful._
- **Risk band High as a high-concern reason?** _Recommended: not in `screening-1` (legacy parity); show the risk band as a column and filter instead._

## 14. Module contract

Filled by `/module-contract` (`06-modular-build.md` §2.1, §3). Only the `screening` folder lives in this spec; the other parts have their own contracts (§1 table).

### 14.1 screening

Folder: `src/modules/screening/` · `src/features/screening/` · Wave: 4 · Plan: SD07

| | |
| --- | --- |
| Owns | Tables `screening_settings`, `screening_runs`, `screening_results` (immutable run snapshots), `screening_saved_filters` (all RLS by `workspace_id`; FKs only to `workspaces`, `companies`, `users`). Routes `/v1/companies/:cid/screening`, `/v1/companies/:cid/screening/trend`, `/v1/companies/:cid/screening-runs`, `/v1/screening-runs/:id*` (incl. `export.xlsx`), `/v1/workspaces/current/screening-settings`, `/v1/companies/:cid/screening-filters*`. Permissions `supplier:rank` (module `ranking`) and `supplier:manage` (settings). Pure engine `engine/` (`ENGINE_VERSION = 'screening-1'`). i18n namespace `screening`. FE route `/suppliers/ranking` |
| Public surface (`index.ts`) | `ScreeningModule`; `ScreeningQueries.run(workspaceId, runId)` → `ScreeningRunView` (dd-reporting renders the `screening_ranking` PDF from the same run as the XLSX); `ScreeningQueries.latestTierFor(workspaceId, supplierIds, year)` → `{ supplierId, tier, conformity, highConcern }[]` (dd-reporting; monitoring later, by event or this query); types `ScreeningRunView`, `ScreeningTier`, `Conformity`; `ScreeningEvents`. FE: `screeningRoutes` |
| Depends on | `supplier-register` `SupplierRegisterService.listSuppliers` / `getSuppliersByIds` (fake `__tests__/fakes/supplier-register.fake.ts`); `supplier-portal` `SupplierAccessService.accessFor` + `assertCanView` for ISO 26000 shared results (fake `supplier-portal.fake.ts`); `questionnaires` `QuestionnaireSummaryQuery.latestAcceptedForSuppliers(workspaceId, supplierIds, { year })` (M21 §14; fake `questionnaires.fake.ts`); `risk` `RiskQueries.risksFor` (fake `risk.fake.ts`); `reference-data` regions, sectors, categories, ISO 26000 node order (fake `reference-data.fake.ts`); M05 `supplierResultsFor` (ISO 26000 deep tier, later; fake `gap-results.fake.ts`); `notifications` `EventBus.publish` (fake); `audit` `AuditService` |
| Emits | `screening.completed` → `{ workspaceId, companyId, runId, year, totals: { assessed, conforming, nonConforming, highConcern, byTier } }` |
| Consumes | — (reads current data through the queries above when asked; runs freeze it) |
