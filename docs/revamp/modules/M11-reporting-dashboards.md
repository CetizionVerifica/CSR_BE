# M11 — Reporting, Dashboards & Exports

> Status: Draft · Phase: 2 (v1: dashboards + gap/materiality PDF) → 3 (report builder) · DD reporting (`dd-reporting`, §4.5): Phase B (dashboard, exports, PDF) → C (regulatory statements) · Depends on: M03–M10, M16; for `dd-reporting` the read models of M19–M25, M09 (`corrective-actions`), M14, M12, M13, M15 · Blocks: —
> Legacy code: FE `performance/*` (home + timeline), `gapAnalysis/GapResult.js` + `gapAnalysis/report/*`, `gapAnalysis/DocAssessmentReport.js`, `materialityAssessment/report/*`, `rankingSystem/supplierReport/*` (jsPDF), `utility/exportImage.js` (html2canvas/dom-to-image), `annualReviewlist/*`, `auditChecklist/*`

## 1. Purpose
Give each audience the view it needs — contributors (what's next), sustainability leads (results & gaps), executives (trend & headline), partners/assessors (portfolio), external readers (branded reports) — and make every number exportable and traceable.

## 2. Users & permissions
`project:read` for dashboards; `report:export` for exports/reports; `report:publish` (admin) to publish/share a report; platform roles see portfolio dashboards across tenants they are entitled to.

Due diligence reporting (`dd-reporting`, §4.5) uses its own permissions, all tied to the `due_diligence` entitlement (M02): `dd_report:read` (DD dashboard, report library: owner, admin, partner_admin, contributor, viewer, auditor), `dd_report:export` (exports, PDF jobs, statement drafting: owner, admin, partner_admin, auditor for exports only), `dd_report:approve` (approve and publish regulatory statements: owner, admin; never the user who submitted the statement). Supplier-side users never see a buyer's DD reports.

## 3. Current state (legacy)
- Home: 7-step timeline + three widgets that only render when the company holds all three licences (else spins forever).
- Gap results (5 tabs): gap tables; performance vs relevance (issue level with 9-level Minor/Major heat-matrix popover); same by core subject; status report (Major = issue level > 5 vs Minor); overall performance **pie** (slice = relevance weight, colour = revised band).
- Materiality: scatter matrices; KPI: line chart; ranking: tables + trend + jsPDF report.
- Export = PNG screenshots (html2canvas with dom-to-image fallback); **no CSV/XLSX anywhere**; PDF only for ranking and dependent on antd DOM internals; chart titles hard-coded English; tooltip HTML built from user data.
- Annual review (UNGC, ~64 items) and ISO 26000 audit checklist (12 items) are static pages with switches that do nothing.

## 4. Scope
### 4.1 Dashboards

| Dashboard | Audience | Content |
|---|---|---|
| **Project dashboard** (M03) | project team | journey, key results widgets (each independent, entitlement-aware) |
| **Company overview** | admin/exec | latest verified gap score & YoY delta, top material topics, KPI status summary (on track/at risk/off track), open actions, supplier risk summary |
| **Gap results** | lead | overall & per core subject (horizontal bars sorted, self vs verified), performance vs relevance per issue (diverging bars), **issue severity matrix** (relevance 0–5 × performance 0–4 grid, counts per cell, Major zone outlined) replacing the popover, Major/Minor status table, drill-down to KCs |
| **Materiality results** (M06) | lead | matrices + ranked tables |
| **Performance** (M09) | lead/exec | KPI trends vs targets, actions board |
| **Portfolio** | partner_admin, platform_assessor/owner | all client projects: stage, % complete, verified score, overdue items, SLA; filters; CSV |
| **Year-over-year** | exec | two or more years side by side (gap per core subject, material topics movement, KPI deltas) |

Rules: every widget has loading skeleton, empty state with CTA, error state with retry; one chart = one message (design system §6); "View as table" + CSV/PNG/SVG download on every chart card.

### 4.2 Reports (server-rendered)
- **Renderer**: worker renders SPA `/print/reports/:reportId` routes with Playwright (Chromium) → PDF (A4/Letter, CSS paged media, running headers/footers, page numbers, ToC with page refs), charts in SVG; DOCX via `docx` library from the same report model; PPTX (exec summary deck) via `pptxgenjs`.
- **Report types (v1)**: Gap Analysis Report; Documentation Assessment Report (M05, single file-score formula); Materiality Report (stakeholder + double materiality, methodology appendix); Supplier Ranking Report (M10); Actions & KPI Progress Report.
- **v2 — Sustainability Report builder**: sections structured by framework (ESRS / GRI / BRSR from M16) with auto-filled tables and charts, narrative blocks (editable rich text, AI draft via M17), disclosure index appendix, versioning, approval, publish.
- Branding: workspace logo/accent, cover page, optional partner/CSRC mark, confidentiality footer.
- Report archive: every generated file stored (M14) with parameters, data snapshot hash and generator version (reproducibility for auditors).
- Share: expiring read-only link (token, optional password) for external stakeholders; download log.
- Scheduling: monthly/quarterly report packs emailed to selected users.

### 4.3 Exports
Every list/table: CSV & XLSX (server-side for large sets, streamed); charts: PNG/SVG via ECharts `getDataURL` (no DOM screenshots); full data export per project (ZIP: JSON + XLSX + evidence index) for portability/GDPR.

### 4.4 Legacy checklists
- UN Global Compact annual review → framework `UNGC` in M16 (10 principles) with a proper self-assessment and CoP-style export.
- ISO 26000 audit checklist → a checklist template in M13, run as a lightweight assessment inside the project (answers saved, % complete, included in the gap report appendix).

### 4.5 Due diligence reporting (SD12, folder `dd-reporting`)

Reporting for the supplier due diligence product (06 §5). It **reads only the public read models** of the other DD modules, through ports (§14.1), and never their tables; it computes no score, risk band or ranking, only counts and deltas of values those read models return.

- **DD dashboard** (02 §9.5) per buyer company: 4 `StatTile`s — suppliers in scope, high-risk suppliers with delta vs the previous period, questionnaire completion %, open corrective actions — then risk trend (12 months) and risk by category, then tier flow (tier 1–3 → risk band), then "Needs attention" (escalations, expiring evidence, overdue actions). A tile whose source module is not entitled or not built shows "Not available" with a link, never a spinner (US-11-1 rule).
- **Exports** (XLSX and CSV) of the DD datasets with the same filters as the screen they come from: `suppliers`, `risk`, `questionnaire-responses`, `certificates`, `corrective-actions`, `findings`, `screening-ranking`, `grievance-statistics` (aggregated only). Column headers in the user's locale, numbers as numbers (not text), dates ISO in CSV and typed in XLSX.
- **Server-rendered PDF reports** (jobs): `dd_overview` (dashboard pack for a period), `supplier_profile` (one supplier: profile, risk with drivers and index attributions, questionnaire results, certificates, findings, CAPs), `screening_ranking` (SD07: same numbers as the screen and the XLSX), and the regulatory statements below. Rendered from a frozen data snapshot (§7.1) by the print routes of §4.2.
- **Regulatory statements**: an annual due diligence report structured like the German LkSG report (risk analysis, prevention measures, remedial measures, complaints procedure, effectiveness review) and a CSDDD annual statement. Each section shows the facts from the read models ("as of" timestamp) next to a narrative the buyer writes; statement templates are versioned (`lksg@1`, `csddd@1`) and their section codes match the M16 framework nodes `LKSG` and `CSDDD`, so the frameworks module can show coverage later. Workflow: draft → in review → approved → published (PDF, immutable).
- Out of scope for v1: share links and scheduled report packs for DD reports (M11 §4.2 mechanisms reused later), DOCX/PPTX for DD, iXBRL.

## 5. User stories & acceptance criteria
- **US-11-1** A company with only the `gap` licence sees a working dashboard (no infinite spinner).
- **US-11-2** I generate the Gap Analysis Report PDF in < 60 s for 609 KCs; numbers match the dashboard; charts are vector; the file is stored with its data snapshot hash.
- **US-11-3** I export the issues table to XLSX with the same columns/filters as on screen, in my language.
- **US-11-4** As a partner I see all 40 client projects with stage and overdue items and export them.
- **US-11-5** As a procurement lead, I open the DD dashboard of my company and see suppliers in scope, high-risk suppliers with the change since last period, questionnaire completion and open corrective actions.
  - AC: Given read models returning 120 suppliers in scope, 14 high risk now and 11 a period ago, 78 % completion and 9 open CAPs, when I open `/due-diligence`, then the tiles show 120, 14 (+3), 78 %, 9 with the numbers from `GET /v1/dd/dashboard` only; with the `due_diligence` entitlement missing the page shows the locked-module panel.
- **US-11-6** As a procurement lead, when a source module is not available (not entitled or not built), the dashboard still renders and says so.
  - AC: Given the monitoring port answers `unavailable`, when the dashboard loads, then "Needs attention" shows "Not available" with an explanation and every other widget renders.
- **US-11-7** As a compliance officer, I export the supplier list with my current filters to XLSX and CSV in my language.
  - AC: Given 40 suppliers filtered to country DE and tier 1, when I export, then the file has 40 rows, German headers for locale `de`, numeric risk scores as numbers, and no cell starts with `=`, `+`, `-` or `@` unescaped; above 5,000 rows the API answers 202 and `report.ready` follows.
- **US-11-8** As a compliance officer, I generate a supplier ranking PDF whose numbers equal the XLSX export and the screen.
  - AC: Given one snapshot, when PDF and XLSX are generated from it, then every score, tier and rank is identical, the PDF is stored with the snapshot hash and generator version, and `report.ready` reaches me in-app and by email.
- **US-11-9** As a compliance officer, I draft the annual LkSG-structured report: each section shows the facts for the period and I write the narrative.
  - AC: Given the period 2026, when I create a statement, then each section lists its facts (e.g. "38 questionnaires sent, 31 completed", "6 complaints received; categories with fewer than 3 cases shown as <3") with their as-of time, and the narrative autosaves.
- **US-11-10** As an admin, I approve and publish a statement submitted by a colleague; I cannot approve my own submission, and a published statement never changes.
  - AC: Given a statement submitted by user A, when A approves, then 403 `four_eyes_required`; when B approves and publishes, then the facts snapshot is frozen with its hash, the PDF is rendered once and stored, and `PATCH` on it answers 409 `statement_locked`.
- **US-11-11** As a buyer, my DD reports never contain supplier data I am not allowed to see.
  - AC: Given a supplier that shares `status_only` with me for 2026, when I generate its supplier profile report, then only the fields the supplier-portal access rules allow appear, exactly as in the read model; another workspace's report id answers 404.

## 6. Domain model
```ts
reports        { id, workspace_id, project_id?, company_id, type, title, locale, params jsonb, status: 'queued'|'rendering'|'ready'|'failed',
                 format: 'pdf'|'docx'|'pptx'|'xlsx', file_id?, data_snapshot_hash, generator_version, created_by, created_at }
report_shares  { id, workspace_id, report_id, token_hash, password_hash?, expires_at, created_by, revoked_at? }
report_share_views { id, share_id, viewed_at, ip_hash }
report_schedules { id, workspace_id, type, params jsonb, cron, recipients uuid[], next_run_at, active }
-- v2 builder
report_documents { id, workspace_id, project_id, framework_code?, title, status: 'draft'|'in_review'|'approved'|'published', version }
report_sections  { id, workspace_id, document_id, key, order, kind: 'narrative'|'table'|'chart'|'datapoint', content jsonb, source_refs jsonb, ai_generated boolean }
```

Due diligence reporting (`dd-reporting`; tenant tables with `workspace_id` and RLS):

```ts
dd_reports           { id, workspace_id, company_id, type: 'dd_overview'|'supplier_profile'|'screening_ranking'|'lksg_statement'|'csddd_statement'|'export',
                       dataset?, format: 'pdf'|'xlsx'|'csv', locale, params jsonb, status: 'queued'|'rendering'|'ready'|'failed',
                       file_id? → files, data_snapshot_hash?, generator_version, error_type?, statement_id?, requested_by → users, created_at, ready_at? }
dd_report_snapshots  { report_id pk → dd_reports, workspace_id, payload jsonb, hash, created_at }        -- the frozen facts a render used
dd_render_tokens     { id, workspace_id, report_id, token_hash, expires_at, used_at? }                    -- one-time, 10 min, for the print route
dd_statements        { id, workspace_id, company_id, framework: 'lksg'|'csddd', template_version, period_start, period_end, title,
                       status: 'draft'|'in_review'|'approved'|'published', submitted_by?, approved_by?, published_report_id?,
                       facts_hash?, supersedes_id?, created_by, created_at, updated_at }
dd_statement_sections { id, workspace_id, statement_id, key, narrative_md, facts jsonb?, facts_as_of?, updated_by, updated_at, unique(statement_id, key) }
```

## 7. Business rules
- Reports read only **approved/validated** data (verified gap scores, validated materiality, approved KPI values) unless the user explicitly generates a "draft" watermarked report.
- Numbers in reports come from the same read-model endpoints as dashboards (single source); rounding: 1 decimal for percentages, locale formatting.
- Share links never expose evidence files unless explicitly included.

### 7.1 Due diligence reporting (`dd-reporting`)

- **Single source**: dashboard, exports and PDFs read the same port methods; a PDF or XLSX is built from one snapshot (`dd_report_snapshots.payload`, `hash = sha256(canonical JSON)`), so PDF, XLSX and screen agree (US-11-8). The print route reads the snapshot, never live data.
- **Deltas** (`engine/deltas.ts`, pure): `delta = current − previous` for counts; percentage points for rates; `null` when the previous period has no data (shown as "—", never 0).
- **Tier flow** (`engine/tier-flow.ts`, pure): counts of suppliers per (tier, risk band) from the supplier read model (tier) and the risk read model (band); suppliers without a band go to "Not assessed". No thresholds here: bands come from `risk`.
- **Small-count suppression** for grievance statistics: any count 1–2 is shown as `<3` in dashboards, exports and statements (protects reporters, M25); totals are suppressed when they would reveal a suppressed cell.
- **Exports**: ≤ 5,000 rows stream synchronously; larger exports become a job (202, `report.ready`). Cells beginning with `=`, `+`, `-`, `@`, tab or CR are prefixed with `'` (CSV/formula injection). Headers through the `localisation` server message formatter (M15).
- **Statements**: state machine `draft → in_review` (submit, `dd_report:export`; freezes the facts snapshot and `facts_hash`) `→ approved` (`dd_report:approve`, approver ≠ submitter) `→ published` (renders the PDF once, stores it, locks the statement); `in_review → draft` and `approved → draft` (reopen, unfreezes facts) are allowed; `published` is final — a correction is a new statement with `supersedes_id`. Facts can be refreshed only in `draft`.
- **Render job** (`dd-report-render` queue): build snapshot → for PDF, open the print route with a one-time render token in headless Chromium (Playwright), wait for `window.__REPORT_READY__`, print A4 → store through `files` (purpose `report`) → `ready` + `report.ready`; timeout 120 s, 2 retries with back-off, then `failed` + `report.failed` with a problem `type`.

## 8. API contract (REST `/v1`)

| Route | Permission |
|---|---|
| `GET /projects/:pid/dashboard` · `GET /companies/:cid/overview` · `GET /portfolio` · `GET /companies/:cid/yoy?years=` | `project:read` (portfolio: partner/platform) |
| `GET /projects/:pid/gap/results?view=core_subjects|issues|severity_matrix` | `project:read` |
| `POST /reports` `{ type, projectId, format, locale, params }` → 202 + id · `GET /reports/:id` · `GET /reports/:id/download` (presigned) | `report:export` |
| `POST /reports/:id/shares` · `DELETE /report-shares/:id` · public `GET /public/reports/:token` | `report:publish` |
| `GET/POST /report-schedules` | `report:export` |
| `GET /exports/:resource.xlsx?…` (generic table export with the same filters as list endpoints) | resource read + `report:export` |

Due diligence reporting (`dd-reporting`):

| Route | Permission |
|---|---|
| `GET /dd/dashboard?companyId=&period=` | `dd_report:read` |
| `GET /dd/exports/:dataset.(xlsx\|csv)?companyId=&…filters` (≤ 5,000 rows, else 202 + report id) | `dd_report:export` |
| `POST /dd/reports` `{ type, companyId, format, locale, params }` → 202 + id (`Idempotency-Key`) · `GET /dd/reports?companyId=&cursor=` · `GET /dd/reports/:id` · `GET /dd/reports/:id/download` (302 to the file) | `dd_report:read` (list, get) / `dd_report:export` (create, download) |
| `GET /dd/reports/:id/snapshot` (print route only) | `@Public()` + one-time render token (`Authorization: Render <token>`), rate-limited |
| `GET/POST /dd/statements` · `GET/PATCH /dd/statements/:id` · `PUT /dd/statements/:id/sections/:key` · `POST /dd/statements/:id/facts:refresh` · `POST /dd/statements/:id/submit` · `…/reopen` | `dd_report:export` |
| `POST /dd/statements/:id/approve` · `POST /dd/statements/:id/publish` | `dd_report:approve` |

## 9. UI
- Dashboards per §4.1 using `StatTile`, `ResiliChart`, `DataTable`; filter bar in one row; skeletons.
- `/reports` library: generated reports with type, date, author, format, status; "New report" dialog (type → scope → format/language → generate) with progress toast and notification when ready.
- `/print/*` routes: no app shell, print CSS, deterministic rendering (fonts preloaded, animations off, `window.__REPORT_READY__ = true` when charts finished).

Due diligence reporting (`dd-reporting` feature):

- `/due-diligence` — DD dashboard (02 §9.5): filter bar (company from the company switcher, period), 4 `StatTile`s with `--motion-count`, `RiskTrendChart` + `RiskByCategoryChart` (2-column grid), `TierFlowChart`, "Needs attention" list; each widget has its own skeleton, empty and error state; every chart card has "View as table" and downloads.
- `/due-diligence/reports` — report library (type, scope, format, language, requested by, status pill, date) and "New report" dialog (type → scope → format and language → generate); status updates in place while a job runs.
- `/due-diligence/statements` and `/due-diligence/statements/:id` — statement list and editor: section navigator with completion, facts table with as-of time and "Refresh facts", narrative editor with autosave, status pill and sticky footer (Submit · Approve · Publish).
- `/print/dd/reports/:id` — print route without shell (§9 rules above), reads the snapshot with the render token.

## 10. Events & audit
`report.generated|failed|downloaded|shared|share_viewed`, `export.generated`.

Due diligence reporting (`dd-reporting`): emits `report.ready` `{ reportId, workspaceId, companyId, type, format, fileId, requestedBy }`, `report.failed` `{ reportId, workspaceId, type, requestedBy, errorType }`, `dd_statement.published` `{ statementId, workspaceId, companyId, framework, periodEnd, reportId }`; dd-reporting itself calls `NotificationService.notify()` for the requester (in-app + email, category `due_diligence`) when a report is ready or failed; `notifications` never maps other modules' events. Audit: `report.requested`, `report.downloaded`, `export.generated` (dataset, filters, row count), `dd_statement.created|submitted|reopened|approved|published`.

## 11. Migration
No legacy reports stored (PNG/PDF were generated client-side) — nothing to migrate. Rebuild legacy report content as the v1 templates and compare numbers on migrated projects.

## 12. Test plan
Visual regression of print routes (Playwright screenshots per template), numeric parity tests (report model vs dashboard endpoints), XLSX schema tests, RTL PDF (Arabic) rendering, performance budget for large reports.

Due diligence reporting (`dd-reporting`): pure engine tests for deltas, tier flow and small-count suppression (table-driven + property-based: suppression never reveals a cell through totals); snapshot parity (PDF model = XLSX rows = dashboard response for one snapshot); statement state machine incl. four-eyes and locked published statements; render job failure and retry; render token single use and expiry; RLS isolation of every `dd_` table; ports replaced by fakes so the module is built before its sources.

## 13. Open questions

1. **LkSG and CSDDD reporting duties are changing** (German reform of LkSG reporting and the EU 2025 "Omnibus" amendments to CSDDD timing and scope). Recommended: ship both statements as versioned templates (`lksg@1`, `csddd@1`) labelled "structured like", with the content team updating section lists when the legal text changes; no filing integration.
2. **Should the ISO 26000 report types (§4.2) share the `dd-reporting` render pipeline?** Recommended: yes — when the ISO chain starts, rename the folder to `reporting` and add the ISO report types to the same pipeline rather than building a second one.
3. **Who may approve statements?** Recommended: `dd_report:approve` for owner and admin with four-eyes; workspaces with a single admin may self-approve with a typed reason (audited).
4. **Report retention?** Recommended: generated DD files kept 7 years (aligned with audit retention, M12), exports 90 days.

## 14. Module contract

Filled by `/module-contract` (`06-modular-build.md` §2.1, §3). M11 is split into folders as they are scheduled; only `dd-reporting` is in the plan so far.

### 14.1 dd-reporting

Folder: `src/modules/dd-reporting/` · `src/features/dd-reporting/` · Wave: 4 · Plan: SD12 (with M16 framework codes `LKSG`, `CSDDD`)

| | |
|---|---|
| Owns | Tables `dd_reports`, `dd_report_snapshots`, `dd_render_tokens`, `dd_statements`, `dd_statement_sections` (tenant, RLS). Routes `/v1/dd/dashboard`, `/v1/dd/exports/*`, `/v1/dd/reports*`, `/v1/dd/statements*`. Permissions `dd_report:read`, `dd_report:export`, `dd_report:approve` (new, entitlement `due_diligence`). Queue `dd-report-render`. i18n namespace `dd-reporting`; FE print route `/print/dd/reports/:id`. |
| Public surface (`index.ts`) | `DdReportingModule`; `DdReportingEvents` (`report.ready`, `report.failed`, `dd_statement.published`; no consumer in v1); read-model types `DdReportRef` and `DdDashboard` (the response shape, for the FE contract only). No query service: other modules never read DD reports. HTTP routes other features' UIs call: `GET /v1/dd/exports/:dataset.*` (through the generic `ExportMenu` primitive in FE `src/components/ui`, from the supplier-register, screening, questionnaires and corrective-actions screens; none of them imports this feature). |
| Depends on | Read-model ports in `ports/` (planned), each wired in `dd-reporting.module.ts` to the provider's exported service and replaced by a fake in `__tests__/fakes/`: `supplier-register` (supplier list and counts, tier), `risk` (summary with previous period, 12-month trend, by category, band per supplier, drivers), `questionnaires` (completion summary, response read model), `supplier-evidence` (certificate status, expiring certificates), `corrective-actions` (CAP summary and list), `grievances` (case statistics, aggregated), `supplier-portal` (`accessFor` for supplier profiles); optional ports answering `unavailable` until built: `screening` (`ScreeningQueries.run` for `screening_ranking`, `latestTierFor`), `dd-audits` (`FindingsQuery`), `monitoring` (`AlertsQuery.summary`, `needsAttention` for the "Needs attention" list). Platform: `reference-data` (label lookups and risk index sources with attribution, per M13 §14), `localisation` (server ICU message formatting and content translations, per M15 §14), `files` (`FilesService.storeGenerated` with purpose `report`, `issueDownloadUrl`), `notifications` (`EventBus.publish`, `notify()`), `audit` (`AuditService`), `workspaces` (company read model, `due_diligence` entitlement). |
| Emits | `report.ready` → `{ reportId, workspaceId, companyId, type, format, fileId, requestedBy }` · `report.failed` → `{ reportId, workspaceId, type, requestedBy, errorType }` · `dd_statement.published` → `{ statementId, workspaceId, companyId, framework, periodEnd, reportId }` |
| Consumes | — (reads on demand; no cache to invalidate in v1) |
