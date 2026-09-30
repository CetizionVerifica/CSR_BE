# M09 — Actions, KPIs & Targets (performance management)

> Status: Draft · Phase: 3 · Depends on: M03, M04, M06, M16 · Blocks: M11, M18 (targets)
> Legacy code: BE `server/models/actionsAndKPIs.js`, `schema/mutations/company/addActionsAndKPIs.js`, `schema/mutations/actionsAndKPIs/*`, `controllers/gab.js` (`GET /api/gapanalysis/:p/:cs/:ioi`) · FE `actionsAndKPIs/*`, `modals/finishedActionAndKpi.js`

## 1. Purpose
Turn assessment results into a managed improvement plan: actions for material or weak issues, KPIs that measure progress, targets, and periodic data collection — year over year.

## 2. Users & permissions
| Role | Can |
|---|---|
| workspace_admin / lead | Create/edit actions, KPIs, targets; approve data (`kpi:manage`) |
| contributor (data owner) | Enter values for assigned KPIs/periods, attach evidence (`kpi:enter`) |
| viewer / auditor | Read |

## 3. Current state (legacy)
- `actionAndKPIs` doc per company: coreSubject, issueOfInterest, action, kpi (free text), baselinePerformance, year; embedded `projectPerformance[] {project, year, performance, targetPerformance, isBaseline, note}` (`note` and top-level `targetPerformance`/`project` are silently dropped).
- New actions only allowed at `MaterialityCompleted`; modal mixes a materiality chart, a "Major issues" table and the form; "Finished" button sets the project to Finished.
- Company tab shows all actions with a yearly performance vs target line chart. No units, owners, due dates, statuses or evidence. Delete broken.

## 4. Scope
### 4.1 Must have (parity + structure)
- **Action** (initiative): title, description, linked issue(s)/topic(s) (ISO 26000 issue, ESRS topic, IRO), origin (gap major issue, materiality, audit finding, supplier CAP), owner, start/due dates, status (`planned | in_progress | done | cancelled | at_risk`), budget (optional), progress %, evidence files, comments.
- **KPI** (metric definition): name, definition, unit (from unit table), direction (higher/lower is better), frequency (monthly/quarterly/annual), aggregation (sum/avg/last), data owner, linked actions and issues, framework datapoint mapping (M16), calculation (manual value or formula over other KPIs, e.g. `injuries / hours_worked × 1,000,000`).
- **Baseline & targets**: baseline value + year; targets per year (e.g. 2026, 2028, 2030) with interim milestones.
- **Data collection**: KPI values per period and per company (and later per site): value, status (`draft → submitted → approved/rejected`), evidence, comment; data requests to owners with due dates and reminders (M12).
- Suggested actions: from gap *Major* issues (issue level > 5) and material issues (M06) — the "Set new action" flow starts from a prioritised list (replaces the legacy modal).
- KPI library: curated KPIs per ISO 26000 issue / GRI / ESRS datapoint (M13 content), selectable instead of free text.
- Progress views: per action status board, per KPI trend vs target, per issue coverage (material issues without actions highlighted).

### 4.2 New
- SDG alignment tags; target templates (SBTi-style for climate via M18).
- Data approval workflow with segregation of duties (enterer ≠ approver).

## 5. User stories & acceptance criteria
- **US-09-1** From the gap results I pick 3 Major issues and create one action each; the action shows its origin and a link back.
- **US-09-2** As a data owner I receive "Q3 2026: 4 KPI values due by 15 Oct", enter them with evidence, submit; the lead approves; the dashboard trend updates.
- **US-09-3** A formula KPI recalculates when any input KPI value for the period is approved; missing inputs show "incomplete".
- **US-09-4** Material issues without any action are flagged on the materiality results page.

## 6. Domain model
```ts
actions      { id, workspace_id, company_id, project_id?, title, description?, origin: 'gap'|'materiality'|'audit'|'supplier'|'manual', origin_ref?,
               owner_user_id?, status, start_date?, due_date?, progress smallint?, budget numeric?, currency?, created_at, updated_at }
action_links { action_id, target_type: 'issue'|'topic'|'iro'|'kpi', target_ref text, workspace_id }
kpis         { id, workspace_id, company_id, library_kpi_id?, name, definition?, unit_code → units, direction: 'up'|'down',
               frequency, aggregation, formula text?, data_owner_user_id?, active boolean }
kpi_targets  { id, workspace_id, kpi_id, year smallint, value numeric, is_baseline boolean }
kpi_values   { id, workspace_id, kpi_id, period_start date, period_end date, site_id?, value numeric?, status, entered_by, approved_by?,
               approved_at?, comment?, file_ids uuid[], unique(kpi_id, period_start, period_end, site_id) }
units        { code pk, dimension, label_key, to_base_factor numeric }   -- global reference, shared with M18
library_kpis { id, code, name_key, unit_code, direction, framework_refs text[] }  -- global, M13
```

## 7. Business rules
- Target progress = `(current − baseline) / (target − baseline)` clamped 0–150 %, direction-aware; status on track / at risk (< 75 % of linear path) / off track (< 50 %).
- Only approved values count in dashboards/reports (drafts visible to the owner & lead with a badge).
- Period locking: once a year is reported (M11 report published), its values are locked; changes require unlock with reason (audited).
- Legacy rule "actions only after materiality" is dropped: actions can be created anytime (M03 §7).

## 8. API contract (REST `/v1`)
| Route | Permission |
|---|---|
| `GET/POST /companies/:cid/actions` · `GET/PATCH/DELETE /actions/:id` | `project:read` / `kpi:manage` |
| `GET /projects/:pid/action-suggestions` (major gap issues + material issues without actions) | `project:read` |
| `GET/POST /companies/:cid/kpis` · `GET/PATCH/DELETE /kpis/:id` · `PUT /kpis/:id/targets` | `kpi:manage` |
| `GET /kpis/:id/values?from=&to=` · `PUT /kpis/:id/values/:period` · `POST /kpi-values/:id/submit|approve|reject` | `kpi:enter` / `kpi:manage` |
| `POST /companies/:cid/data-requests` (period, KPIs, owners, due date) | `kpi:manage` |
| `GET /library/kpis?issue=&framework=` | authenticated |

## 9. UI
- `/companies/:cid/performance` tabs: **Actions** (board by status + table), **KPIs** (table with sparkline, latest value, target, status pill), **Data entry** (spreadsheet grid: KPIs × periods, paste from Excel, evidence icon per cell), **Targets**.
- KPI detail: line chart with target band and action annotations (design system §6.4), values table, history.
- Project tab `/projects/:pid/actions`: actions linked to this project's issues + "Suggested" panel.

## 10. Events & notifications
`action.created|status_changed|overdue`, `kpi.value.submitted|approved|rejected`, `data_request.created|due_soon|overdue`.

## 11. Migration
Each legacy `actionAndKPIs` → one `action` (title = action text, origin `manual`, link to issue) + one `kpi` (name = kpi text, unit `unknown` → needs review flag) + `kpi_targets` (baseline from `baselinePerformance`, targets from `projectPerformance.targetPerformance`) + `kpi_values` (annual periods from `projectPerformance.performance` by `year`).

## 12. Test plan
Progress formula (both directions, baseline = target), formula KPIs (division by zero, missing inputs), approval segregation, period locking, grid paste parsing (locales with comma decimals).
