# M11 — Reporting, Dashboards & Exports

> Status: Draft · Phase: 2 (v1: dashboards + gap/materiality PDF) → 3 (report builder) · Depends on: M03–M10, M16 · Blocks: —
> Legacy code: FE `performance/*` (home + timeline), `gapAnalysis/GapResult.js` + `gapAnalysis/report/*`, `gapAnalysis/DocAssessmentReport.js`, `materialityAssessment/report/*`, `rankingSystem/supplierReport/*` (jsPDF), `utility/exportImage.js` (html2canvas/dom-to-image), `annualReviewlist/*`, `auditChecklist/*`

## 1. Purpose
Give each audience the view it needs — contributors (what's next), sustainability leads (results & gaps), executives (trend & headline), partners/assessors (portfolio), external readers (branded reports) — and make every number exportable and traceable.

## 2. Users & permissions
`project:read` for dashboards; `report:export` for exports/reports; `report:publish` (admin) to publish/share a report; platform roles see portfolio dashboards across tenants they are entitled to.

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

## 5. User stories & acceptance criteria
- **US-11-1** A company with only the `gap` licence sees a working dashboard (no infinite spinner).
- **US-11-2** I generate the Gap Analysis Report PDF in < 60 s for 609 KCs; numbers match the dashboard; charts are vector; the file is stored with its data snapshot hash.
- **US-11-3** I export the issues table to XLSX with the same columns/filters as on screen, in my language.
- **US-11-4** As a partner I see all 40 client projects with stage and overdue items and export them.

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

## 7. Business rules
- Reports read only **approved/validated** data (verified gap scores, validated materiality, approved KPI values) unless the user explicitly generates a "draft" watermarked report.
- Numbers in reports come from the same read-model endpoints as dashboards (single source); rounding: 1 decimal for percentages, locale formatting.
- Share links never expose evidence files unless explicitly included.

## 8. API contract (REST `/v1`)

| Route | Permission |
|---|---|
| `GET /projects/:pid/dashboard` · `GET /companies/:cid/overview` · `GET /portfolio` · `GET /companies/:cid/yoy?years=` | `project:read` (portfolio: partner/platform) |
| `GET /projects/:pid/gap/results?view=core_subjects|issues|severity_matrix` | `project:read` |
| `POST /reports` `{ type, projectId, format, locale, params }` → 202 + id · `GET /reports/:id` · `GET /reports/:id/download` (presigned) | `report:export` |
| `POST /reports/:id/shares` · `DELETE /report-shares/:id` · public `GET /public/reports/:token` | `report:publish` |
| `GET/POST /report-schedules` | `report:export` |
| `GET /exports/:resource.xlsx?…` (generic table export with the same filters as list endpoints) | resource read + `report:export` |

## 9. UI
- Dashboards per §4.1 using `StatTile`, `ResiliChart`, `DataTable`; filter bar in one row; skeletons.
- `/reports` library: generated reports with type, date, author, format, status; "New report" dialog (type → scope → format/language → generate) with progress toast and notification when ready.
- `/print/*` routes: no app shell, print CSS, deterministic rendering (fonts preloaded, animations off, `window.__REPORT_READY__ = true` when charts finished).

## 10. Events & audit
`report.generated|failed|downloaded|shared|share_viewed`, `export.generated`.

## 11. Migration
No legacy reports stored (PNG/PDF were generated client-side) — nothing to migrate. Rebuild legacy report content as the v1 templates and compare numbers on migrated projects.

## 12. Test plan
Visual regression of print routes (Playwright screenshots per template), numeric parity tests (report model vs dashboard endpoints), XLSX schema tests, RTL PDF (Arabic) rendering, performance budget for large reports.
