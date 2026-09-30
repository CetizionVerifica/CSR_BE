# 04 — Data Migration (MongoDB legacy → PostgreSQL new) & Cut-over

> Status: Proposed · Owner: BE lead · Runs: dry-runs from Phase 2, final run at cut-over
> Principle: the new system is built from scratch; customer data is carried over **once** by a repeatable, idempotent ETL. Module-specific mappings are in each `modules/Mxx-*.md` §11; this document is the overall plan.

## 1. Approach
- Code lives in `CSR_BE/etl/` (TypeScript, run with `tsx`), separate from the app, reusing the app's Prisma client and **engines** (so recomputed scores use exactly the new logic).
- **Extract**: from a `mongodump` snapshot restored into a local/staging Mongo (never against production directly); read-only user.
- **Transform**: pure functions per collection → new rows; every new row gets a UUIDv7 and a `legacy_id` (ObjectId hex) where applicable; an `etl_id_map (collection, legacy_id, new_table, new_id)` table resolves references.
- **Load**: Prisma `createMany` in batches of 1,000 (or `COPY` for large tables like survey answers) inside per-workspace transactions; RLS bypass role used only by the ETL.
- **Idempotent**: re-running truncates the target workspace's rows (or the whole DB in dry-runs) and reloads; deterministic UUIDs derived from `legacy_id` (UUIDv5 namespace) so re-runs produce the same ids.
- **Report**: every run writes `etl/reports/<timestamp>.json` + a human summary (counts in/out per entity, rejected records with reasons, warnings, golden-master diffs).

## 2. Order of execution
1. Reference data (from `prisma/seed`, not from Mongo): taxonomy & KCs, survey templates, sectors, countries, units, frameworks.
2. `users` → users (M01).
3. `agencies` → workspaces; resellers → partner workspaces + grants (M02).
4. memberships (from `user.agencies[]`, roles) (M01).
5. `companies` → companies; licences → entitlements (M02).
6. `employees`, `stakeholders` → people (M07).
7. `projects` → projects + workstreams + transitions (M03).
8. `gapfiles` + S3 objects → files, versions, links (M14) — S3 batch copy job runs before, keyed by `legacy_id`.
9. `gapanalyses` → gap_assessments + gap_answers (+ answer files) (M04); `gapfile.criteria` → doc assessment rounds (M05).
10. `projectsurveys`, `new_surveys` → survey campaigns, recipients, responses, answers (M08).
11. `materialities` → materiality results/scores, stakeholder classes (M06).
12. `actionandkpis` → actions, kpis, targets, values (M09).
13. `company.suppliers`, `agency.partners`, `supplierrequests`, `externalsuppliers`, `project.supplierProperties` → suppliers, supplier_access (M10).
14. Recompute derived data with new engines (gap scores, verified scores, materiality) into *new* result rows; keep legacy stored values in `etl_legacy_values` for comparison.
15. Audit seed: one `audit_events` row per migrated workspace (`system.migrated`) with the ETL report hash.

## 3. Data-quality rules (decided up-front)
| Case | Rule |
|---|---|
| Password stored in plaintext (not bcrypt format) | Do not import; user gets a reset email at launch |
| `Company.password`, `user.otp`, request `logs` | Never migrated |
| Orphans (project without company, answers without project, files missing in S3) | Skip + report; files missing → evidence link marked "file missing in migration" |
| Duplicate emails (case variants) | Merge users; memberships unioned; report |
| Two projects same company + year | Second becomes `is_additional = true` |
| Unknown KC keys in gap answers | Report; keep in `gap_answers_unmapped` table for manual review |
| Invalid enum/status values (`updateItem` skipped validators) | Map via table in M03 §7; unknown → `in_progress` + warning |
| Stakeholder without class in closed survey | Class `B` (default) + warning (only affects recomputation, not the stored legacy result) |
| Soft-deleted/inactive records | Migrate with `active=false` / `deleted_at` so history stays consistent |
| Legacy survey links (`sideID` tokens) | Not migrated — close/finish legacy campaigns before cut-over |

## 4. Validation
- **Counts**: per entity in vs out vs rejected — must reconcile.
- **Referential**: all FKs valid (DB constraints enforce it).
- **Golden master** (per module):
  - Gap: `gap_assessments.overall_performance/relevance/overall_revised` vs legacy `weightedPerformance/relevance/revisedWeightValue` — tolerance ±0.1; list all larger diffs with explanation.
  - Materiality: recomputed stakeholder scores vs legacy `weightValue` per node — tolerance ±0.01 except documented intentional changes (M06 §7.1).
  - Supplier ranking: new engine output vs a legacy-FE-logic replay (script port of `supplierRanking/_helper.js` with the known bugs toggled) for sample buyers.
- **Spot checks**: 10 projects chosen with the business; side-by-side screenshots legacy vs new for dashboards and reports; signed off in the ETL report.
- **Security checks**: no PII in logs; no row visible across workspaces (RLS test suite run against migrated data).

## 5. Dry runs
| Dry run | When | Data | Goal |
|---|---|---|---|
| DR1 | end of Phase 2 | anonymised snapshot | mapping completeness, performance baseline |
| DR2 | pilot start | real snapshot (staging, restricted access) | golden-master sign-off for pilot customers |
| DR3 | 2 weeks before cut-over | real snapshot | full rehearsal with timings, runbook validated |

## 6. Cut-over runbook (outline)
1. T-14 days: announce date, freeze feature work on `legacy`, close legacy survey campaigns or ask customers to finish.
2. T-1 day: final DR3 fixes merged; S3 incremental copy of new evidence.
3. T0: legacy app in **read-only maintenance mode** (banner + API write block on the `legacy` branch deployment); final `mongodump`; ETL run; validation report; go/no-go meeting.
4. Go: switch DNS `app.resilisense.org` → new SPA, `api.resilisense.org` → new API; send "welcome to the new ResiliSense" email (with reset link for users without importable passwords).
5. Legacy stays reachable read-only at `legacy.resilisense.org` for 90 days (internal/admin only), then archived (encrypted Mongo dump + S3 objects retained per retention policy) and decommissioned.
6. **Rollback** (within 48 h): if no-go or severe issue, point DNS back to legacy and lift read-only; data created in the new system during the window is exported for manual re-entry (keep the window short).

## 7. Open questions
- Retention period for the legacy archive (contractual/legal)?
- Are there customers whose data must **not** be migrated (churned, trial)?
