# DD reporting (M11 §4.5 + M16 · SD12)

> Spec: `docs/revamp/modules/M11-reporting-dashboards.md` (§4.5, §7.1, §14.1; framework codes in `M16-frameworks-disclosures.md`) · Status: Draft · Wave: 4

## Purpose

Due diligence reporting for buyer companies: the DD dashboard (02 §9.5), XLSX/CSV exports of the DD datasets, server-rendered PDF reports (overview pack, supplier profile, screening ranking) and the annual regulatory statements (LkSG-structured report, CSDDD statement). It composes the **public read models** of the other DD modules through ports and computes no score, band or ranking: only counts, deltas and suppression of small counts.

## Owns

- Tables (tenant, `workspace_id`, RLS + `FORCE`, migration `<ts>_rls_dd_reporting_tables`): `dd_reports`, `dd_report_snapshots`, `dd_render_tokens`, `dd_statements`, `dd_statement_sections` (M11 §6). FKs only to `workspaces`, `companies`, `users`, `files`.
- Routes (M11 §8), all with the `due_diligence` entitlement:

| Route                                                                                                                               | Decorator                                         |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `GET /v1/dd/dashboard?companyId=&period=`                                                                                           | `@Can('dd_report:read')`                          |
| `GET /v1/dd/exports/:dataset.(xlsx\|csv)` (sync ≤ 5,000 rows, else 202 + report id)                                                 | `@Can('dd_report:export')`                        |
| `POST /v1/dd/reports` (`Idempotency-Key`, 202) · `GET /v1/dd/reports/:id/download`                                                  | `@Can('dd_report:export')`                        |
| `GET /v1/dd/reports` · `GET /v1/dd/reports/:id`                                                                                     | `@Can('dd_report:read')`                          |
| `GET /v1/dd/reports/:id/snapshot`                                                                                                   | `@Public()` + one-time render token, rate-limited |
| `GET/POST /v1/dd/statements` · `GET/PATCH …/:id` · `PUT …/:id/sections/:key` · `POST …/:id/facts:refresh` · `…/submit` · `…/reopen` | `@Can('dd_report:export')`                        |
| `POST /v1/dd/statements/:id/approve` · `…/publish`                                                                                  | `@Can('dd_report:approve')`                       |

- Permissions (planned, M01 matrix + `PERMISSION_MODULE` → `due_diligence`): `dd_report:read`, `dd_report:export`, `dd_report:approve`.
- Queue `dd-report-render` (processor registered in `src/worker.ts`). Events/audit actions in `events.ts` (planned). Problem types: `four_eyes_required`, `statement_locked`, `invalid_transition`, `render_failed`, `render_token_invalid`, `entitlement_required`.

## Public surface (`index.ts`)

| Export (planned)                                                                | Why others need it                                                                             |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `DdReportingModule`                                                             | Registered in `app.module.ts` and `worker.ts`                                                  |
| `DdReportingEvents` (`report.ready`, `report.failed`, `dd_statement.published`) | Name constants; no consumer in v1 (dd-reporting notifies the requester itself with `notify()`) |
| `DdReportRef`, `DdDashboard` types                                              | Response shapes (FE contract via OpenAPI)                                                      |

No query service: no module reads DD reports. Other features' UIs call `GET /v1/dd/exports/:dataset.*` for their export buttons.

## Depends on

Ports in `ports/` (planned), one interface per source, wired in `dd-reporting.module.ts` to the provider's exported service and faked in `__tests__/fakes/<source>.fake.ts` (fixtures, never another module's tables):

| Port                                                   | Provider (spec §14)                                                                                                                                            | Used for                                                                   |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `SupplierSource`                                       | `supplier-register` (M19)                                                                                                                                      | suppliers in scope, list rows for exports, tier per supplier               |
| `RiskSource`                                           | `risk` (M22)                                                                                                                                                   | summary incl. previous period, 12-month trend, by category, band + drivers |
| `QuestionnaireSource`                                  | `questionnaires` (M21)                                                                                                                                         | completion summary, response rows                                          |
| `EvidenceSource`                                       | `supplier-evidence` (M14)                                                                                                                                      | certificate status, expiring certificates                                  |
| `CapSource`                                            | `corrective-actions` (M09)                                                                                                                                     | CAP summary and rows                                                       |
| `GrievanceSource`                                      | `grievances` (M25)                                                                                                                                             | aggregated case statistics only                                            |
| `AccessSource`                                         | `supplier-portal` (M20)                                                                                                                                        | `accessFor` for supplier profile reports                                   |
| `ScreeningSource`, `AuditFindingSource`, `AlertSource` | `screening` (M10 §14.1 `ScreeningQueries.run`, `latestTierFor`), `dd-audits` (M23 `FindingsQuery`), `monitoring` (M24 `AlertsQuery.summary`, `needsAttention`) | optional: answer `{ status: 'unavailable' }` until built (same wave)       |

Platform: `reference-data` (labels, risk index sources + attribution, M13 §14), `localisation` (server message formatting, content translations, M15 §14), `files` (store the generated file with purpose `report`, download URL, M14), `notifications` (`EventBus.publish`, `notify()` to the requester, M12 §14), `audit` (`AuditService`), `workspaces` (company read model, `due_diligence` entitlement).

## Events

- Emits `report.ready` `{ reportId, workspaceId, companyId, type, format, fileId, requestedBy }`, `report.failed` `{ reportId, workspaceId, type, requestedBy, errorType }`, `dd_statement.published` `{ statementId, workspaceId, companyId, framework, periodEnd, reportId }`.
- Consumes nothing (reads on demand). Audit: `report.requested`, `report.downloaded`, `export.generated` (dataset, filters, row count), `dd_statement.created|submitted|reopened|approved|published`.

## Components & behaviour

- `dashboard.service.ts` — calls the ports in parallel for one company and period; a failing or unavailable port yields that widget's `{ status: 'unavailable' | 'error' }`, never fails the whole response (US-11-6).
- `exports.service.ts` + `exports/datasets/*.ts` — one column definition per dataset (`suppliers`, `risk`, `questionnaire-responses`, `certificates`, `corrective-actions`, `findings`, `screening-ranking`, `grievance-statistics`); streams CSV/XLSX (exceljs streaming writer); localised headers; formula-injection escaping; > 5,000 rows → report job.
- `reports.service.ts` — creates `dd_reports`, builds and stores the snapshot (`hash = sha256(canonical JSON)`), enqueues the render; download = 302 to the `files` URL, audited.
- `dd-report-render.processor.ts` — PDF: issue a render token, open `${APP_ORIGIN}/print/dd/reports/:id` in headless Chromium (Playwright), wait for `window.__REPORT_READY__`, print A4; XLSX from the same snapshot; store via `files`; 120 s timeout, 2 retries with back-off; then `ready`/`failed` + event.
- `statements.service.ts` — state machine `draft → in_review → approved → published`, reopen to `draft` from `in_review`/`approved`; submit freezes facts + `facts_hash`; approve requires approver ≠ submitter (`four_eyes_required`); publish renders once and locks (`statement_locked` on later writes); corrections are new statements with `supersedes_id`. Templates `statements/templates/{lksg,csddd}.v1.ts` (planned): section keys = M16 node codes, each with its fact query over the ports.
- `engine/` (pure, planned): `deltas.ts` (count delta, percentage-point delta, `null` without previous data), `tier-flow.ts` (counts per tier × band, "not assessed" bucket), `suppress.ts` (counts 1–2 → `<3`, complementary suppression of totals), `canonical-json.ts`.

## Invariants

- Never reads, writes or joins another module's tables; every number comes from a port and is not recomputed.
- Every query inside `prisma.withTenant`; another workspace's report or statement id answers 404; the render token is single-use, 10 min, bound to one report.
- PDF, XLSX and the screen agree for one snapshot; the print route reads only the snapshot.
- Published statements and stored report files are immutable. Grievance counts below 3 never appear unsuppressed.

## Tests

- Unit: `engine/*.spec.ts` + `engine/*.property.spec.ts` (suppression never recoverable from totals; delta sign), dataset column specs, statement state machine.
- E2e (planned): `test/dd-reporting-dashboard.e2e-spec.ts` (US-11-5, US-11-6), `test/dd-reporting-exports.e2e-spec.ts` (US-11-7), `test/dd-reporting-reports.e2e-spec.ts` (US-11-8, US-11-11, render token), `test/dd-reporting-statements.e2e-spec.ts` (US-11-9, US-11-10); extend `route-authorization`, `route-access-matrix`, `tenancy-rls`. Ports overridden with `__tests__/fakes/*`.

## Not here

Scores, risk bands, tiers and rankings (`risk`, `screening`); supplier visibility rules (`supplier-portal`); sending notifications (`notifications`); file storage (`files`); ISO 26000 reports and share links (rest of M11, see M11 §13 Q2); framework coverage (M16).
