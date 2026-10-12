# M09 — Actions, KPIs & Targets (performance management)

> Status: Draft · Phase: 3 · Depends on: M03, M04, M06, M16 · Blocks: M11, M18 (targets)
> Supplier corrective action plans (`corrective-actions`, plan SD09, wave 3): Phase B · Depends on: M19 supplier-register, M14 files, M12 notifications · consumes `finding.raised` (M23), `supplier.linked` (M20) · split from M10 §4.2 (CAP bullet), §6 (`cap_findings`), §10 (`cap.overdue`)
> Legacy code: BE `server/models/actionsAndKPIs.js`, `schema/mutations/company/addActionsAndKPIs.js`, `schema/mutations/actionsAndKPIs/*`, `controllers/gab.js` (`GET /api/gapanalysis/:p/:cs/:ioi`) · FE `actionsAndKPIs/*`, `modals/finishedActionAndKpi.js`

## 1. Purpose
Turn assessment results into a managed improvement plan: actions for material or weak issues, KPIs that measure progress, targets, and periodic data collection — year over year.

The same action model also carries **supplier corrective action plans (CAPs)**: when an audit (M23), questionnaire (M21), grievance (M25) or screening (M10) reveals a non-conformity at a supplier, the buyer issues a plan of required actions with due dates, the supplier responds and reports progress through the supplier portal or a token link, the buyer verifies each action, and overdue plans escalate up to a suspension decision. Those actions have `origin = 'supplier'` and are owned by the `corrective-actions` module (§4.3, §14.1).

## 2. Users & permissions

| Role | Can |
|---|---|
| workspace_admin / lead | Create/edit actions, KPIs, targets; approve data (`kpi:manage`) |
| contributor (data owner) | Enter values for assigned KPIs/periods, attach evidence (`kpi:enter`) |
| viewer / auditor | Read |

Supplier corrective action plans (`corrective-actions`, entitlement `due_diligence` except `cap:respond`):

| Role | Can | Permission |
|---|---|---|
| Buyer workspace_owner / workspace_admin / partner_admin (procurement lead, compliance officer) | Create, edit, issue and cancel CAPs, accept supplier responses, extend due dates, decide suspension, edit the escalation policy | `cap:manage` (+ `cap:read`) |
| Buyer workspace_owner / workspace_admin / partner_admin | Verify or reject completed actions, close a plan | `cap:verify` |
| Buyer contributor / viewer / auditor | Read CAPs | `cap:read` |
| Supplier workspace owner / admin / contributor (linked supplier) | Read CAPs addressed to their company, submit the response and action progress with evidence | `cap:respond` (no entitlement needed) |
| Supplier contact (public token, no account) | Same as above for one plan | token route, rate-limited |

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

### 4.3 Supplier corrective action plans (`corrective-actions`, SD09)
- **From findings to a plan**: every raised finding of severity minor, major or critical (M23 `finding.raised`) adds one required action to a **draft CAP** for that supplier and audit (one plan per audit and supplier); observations never create actions. CAPs can also be created by hand from a questionnaire non-conformance, a grievance case, a screening result or free text (`source_type`).
- **Required actions** have the M09 action shape (title, description, status, due date, progress, evidence) plus the finding snapshot, required evidence and a verification state. Default due dates come from the finding severity (§7.1).
- **Issue to the supplier**: the plan is sent to the supplier contact (email with a token link that works for off-platform suppliers) and shown in-app to linked suppliers (M20 "My customers"). For minor-only plans the buyer may skip the response step.
- **Supplier response**: root cause and the proposed measure and date per action; the buyer accepts it or requests changes (numbered response rounds).
- **Progress and verification**: the supplier reports each action done with a note and evidence (M14 uploads, virus-scanned); the buyer verifies or rejects with a comment; the plan closes when every non-cancelled action is verified, which closes the linked findings (`cap.closed`).
- **Escalation and suspension**: reminder before the due date, overdue notice, escalation to managers, then a suspension recommendation; suspending the supplier is always a human decision with a reason, applied by `supplier-register` through the `cap.suspension_decided` event.
- Out of scope here: the findings themselves (M23), alert feeds and digests across modules (M24 monitoring consumes `cap.overdue`/`cap.escalated`), supplier status values (M19).

## 5. User stories & acceptance criteria
- **US-09-1** From the gap results I pick 3 Major issues and create one action each; the action shows its origin and a link back.
- **US-09-2** As a data owner I receive "Q3 2026: 4 KPI values due by 15 Oct", enter them with evidence, submit; the lead approves; the dashboard trend updates.
- **US-09-3** A formula KPI recalculates when any input KPI value for the period is approved; missing inputs show "incomplete".
- **US-09-4** Material issues without any action are flagged on the materiality results page.

Supplier corrective action plans (`corrective-actions`):
- **US-09-5** As a compliance officer, I get a draft CAP with one required action per raised audit finding, so that I don't retype findings.
  - AC: Given `finding.raised` events for two major findings and one observation of the same audit, then one draft CAP for that supplier and audit exists with two actions (due-date defaults 60 days after issue) and no action for the observation; replaying the same event creates nothing new.
- **US-09-6** As a procurement lead, I issue the CAP to the supplier, who sees it in the portal or through the email link and answers with root causes and planned measures.
  - AC: Given a draft CAP, when I issue it with a contact email, then status is `issued`, the supplier contact gets an email with a token link (and linked suppliers an in-app item), and `cap.issued` is emitted; when the supplier submits a response, round 1 is stored and I can accept it (status `accepted`) or request changes with a comment (round 2 opens).
- **US-09-7** As a supplier, I report an action as done with evidence, and the buyer verifies or rejects it.
  - AC: Given an accepted CAP, when the supplier submits an action with a note and a `ready` file, then its verification is `pending`; when the buyer rejects with a comment the action returns to `in_progress` and the supplier is notified; when every non-cancelled action is verified and the buyer closes the plan, status is `closed` and `cap.closed` names the finding ids.
- **US-09-8** As a buyer, overdue actions remind, then escalate, then recommend suspension, so that nothing is silently forgotten.
  - AC: Given the default policy and an action due on 1 March, then a reminder goes out on 22 February, `cap.overdue` is emitted once on 2 March, `cap.escalated` level 3 on 16 March and level 4 (suspension recommended) on 1 April; a critical-finding action reaches level 4 on 9 March; each step happens once even if the scan runs hourly.
- **US-09-9** As a procurement lead, I decide whether to suspend a supplier when suspension is recommended, and can lift it later.
  - AC: Given a CAP at level 4, when I choose "Suspend supplier" with a reason, then `cap.suspension_decided { decision: 'suspend' }` is emitted and audited; the supplier is never suspended without this decision; "Lift suspension" emits `decision: 'lift'`.
- **US-09-10** A supplier user can only see CAPs addressed to its own company, and a buyer of another workspace sees none of them.
  - AC: Given CAPs of buyer A to supplier S, then members of S's workspace with `cap:respond` see them, a member of buyer B gets 404 for their ids, and a token for one CAP never reveals another.

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

Actions with `origin = 'supplier'` are **not** stored in `actions`: they live in the `corrective-actions` tables below with the same columns (status enum, due date, progress, evidence), so the M09 performance views can list them through the `corrective-actions` read model without sharing a table (06 §3).

```ts
cap_plans      { id, workspace_id (buyer), company_id → companies, supplier_id uuid (M19, no FK), supplier_workspace_id uuid? (linked supplier),
                 ref text (e.g. 'CAP-2026-0007', unique per workspace), title, source_type: 'audit_finding'|'questionnaire'|'grievance'|'screening'|'manual',
                 source_ref text?, status: 'draft'|'issued'|'accepted'|'pending_verification'|'closed'|'cancelled', severity: 'minor'|'major'|'critical',
                 response_required boolean, response_round smallint, owner_user_id → users?, issued_at?, due_date date? (derived: max open action due),
                 escalation_level smallint (0–4), suspension_state: 'none'|'recommended'|'suspended'|'lifted', closed_at?, closed_by → users?,
                 close_note?, cancelled_reason?, created_by → users, created_at, updated_at }
cap_actions    { id, workspace_id, cap_id → cap_plans, company_id → companies, origin 'supplier' (check), origin_ref text? (finding id),
                 finding jsonb? { ref, title, severity, categoryCode } (snapshot from finding.raised), title, description?, required_evidence?,
                 status: 'planned'|'in_progress'|'done'|'cancelled'|'at_risk', due_days smallint?, due_date date?, progress smallint?,
                 verification: 'not_submitted'|'pending'|'verified'|'rejected', supplier_note?, file_ids uuid[] (→ files), verification_comment?,
                 verified_by → users?, verified_at?, escalation_level smallint, cancelled_reason?, created_at, updated_at,
                 unique(workspace_id, origin_ref) }
cap_responses  { id, workspace_id, cap_id → cap_plans, round smallint, root_cause text, measures jsonb [{ actionId, measure, plannedDate }],
                 submitted_via: 'portal'|'token', submitted_by_user_id → users? (supplier user), submitted_at, decision: 'accepted'|'changes_requested'|null,
                 decision_comment?, decided_by → users?, decided_at?, unique(cap_id, round) }
cap_events     { id, workspace_id, cap_id, action_id?, kind: 'reminder'|'overdue'|'escalated'|'suspension_recommended'|'suspended'|'suspension_lifted'|'due_extended',
                 level smallint?, reason?, by_user_id?, occurred_at, unique(action_id, kind, level) }   -- idempotency of the scan
cap_response_links { id, workspace_id, cap_id, email_hash, token_hash unique, expires_at, revoked_at?, last_used_at? }
cap_supplier_links { workspace_id, supplier_id uuid, supplier_workspace_id uuid, linked_at, primary key(workspace_id, supplier_id) }   -- projection of supplier.linked / supplier.unlinked
cap_policies   { workspace_id pk, due_days jsonb { minor: 90, major: 60, critical: 30 }, remind_before_days 7, escalate_after_days 14,
                 suspend_after_days 30, critical_suspend_after_days 7, updated_by, updated_at }   -- defaults when absent
```

- RLS: every table has `workspace_id` with the standard policy; `cap_plans`, `cap_actions` and `cap_responses` add a **read** policy for `supplier_workspace_id = app_current_workspace()` (the M10 `supplier_access` pattern), and supplier-side writes go only through the response/submit services, which audit every access (M12).
- `supplier_workspace_id` is filled from the `supplier.linked` event (M20 payload `supplierWorkspaceId`): kept per supplier in the plan rows when the plan is created after linking (looked up from earlier plans of that supplier or a small `cap_supplier_links` projection) and back-filled on open plans when the link happens later.

## 7. Business rules
- Target progress = `(current − baseline) / (target − baseline)` clamped 0–150 %, direction-aware; status on track / at risk (< 75 % of linear path) / off track (< 50 %).
- Only approved values count in dashboards/reports (drafts visible to the owner & lead with a badge).
- Period locking: once a year is reported (M11 report published), its values are locked; changes require unlock with reason (audited).
- Legacy rule "actions only after materiality" is dropped: actions can be created anytime (M03 §7).

### 7.1 Supplier corrective action plans (`corrective-actions/engine/`, pure)

**Plan state machine** (`engine/cap-state.ts`):

```
draft ──issue──▶ issued ──accept response──▶ accepted ──all actions submitted──▶ pending_verification ──close──▶ closed
                   ▲  │                          ▲                                    │
                   └──┘ request changes          └──────── an action rejected ────────┘
issue with response_required = false: draft ──▶ accepted      any state except closed ──cancel (reason)──▶ cancelled
```

- `issue` requires ≥ 1 non-cancelled action, a contact email and every action's due date (explicit, or `issued_at + due_days`). `response_required` is forced `true` when any action stems from a major or critical finding.
- `accepted → pending_verification` happens automatically when every non-cancelled action has `verification ∈ { pending, verified }`; a rejection moves the plan back to `accepted`.
- `close` (by `cap:verify`) requires every non-cancelled action `verified`; emits `cap.closed` with the `origin_ref`s (finding ids).
- Plan `severity` = highest severity among non-cancelled actions' findings (manual actions: chosen by the buyer).

**Action rules**: the supplier moves `planned → in_progress → done`; submitting `done` sets `verification = pending` and needs a note and, when `required_evidence` is set, ≥ 1 file with status `ready`. Verify → `verified`; reject (comment required) → `status = in_progress`, `verification = rejected`. Extending a due date after issue requires a reason, writes a `due_extended` event and recomputes the escalation level from the new date.

**Default due dates** (`engine/due-dates.ts`): `due_days` by finding severity — critical 30, major 60, minor 90 (from `cap_policies` when set); observations never become actions.

**Overdue and escalation ladder** (`engine/escalation.ts`, `today` in the workspace time zone, for actions not `cancelled` and not `verified`):

| Level | Condition | Effect (once per action and level) |
|---|---|---|
| 1 reminder | `today ≥ due_date − remind_before_days` and verification ∉ {pending, verified} | Reminder email/in-app to the supplier contact |
| 2 overdue | `today > due_date` | `cap.overdue`; supplier contact and plan owner notified |
| 3 escalated | `today > due_date + escalate_after_days` | `cap.escalated { level: 3 }`; holders of `cap:manage` notified |
| 4 suspension recommended | `today > due_date + suspend_after_days`, or the action's finding is critical and `today > due_date + critical_suspend_after_days` | `cap.escalated { level: 4, recommendation: 'suspend' }`; plan `suspension_state = 'recommended'` |

- `actionLevel` is monotonic for a given due date; plan `escalation_level` = max over open actions. An action with verification `pending` stops escalating while the buyer reviews it (the buyer's delay is not the supplier's).
- Suspension is never automatic: `cap:manage` decides `suspend` or `lift` with a reason → `cap.suspension_decided`; `supplier-register` sets or clears the supplier status.

## 8. API contract (REST `/v1`)

| Route | Permission |
|---|---|
| `GET/POST /companies/:cid/actions` · `GET/PATCH/DELETE /actions/:id` | `project:read` / `kpi:manage` |
| `GET /projects/:pid/action-suggestions` (major gap issues + material issues without actions) | `project:read` |
| `GET/POST /companies/:cid/kpis` · `GET/PATCH/DELETE /kpis/:id` · `PUT /kpis/:id/targets` | `kpi:manage` |
| `GET /kpis/:id/values?from=&to=` · `PUT /kpis/:id/values/:period` · `POST /kpi-values/:id/submit|approve|reject` | `kpi:enter` / `kpi:manage` |
| `POST /companies/:cid/data-requests` (period, KPIs, owners, due date) | `kpi:manage` |
| `GET /library/kpis?issue=&framework=` | authenticated |

Supplier corrective action plans (`corrective-actions`):

| Route | Permission |
|---|---|
| `GET /companies/:cid/caps?status=&supplierId=&severity=&overdue=&level=&source=&findingId=&cursor=` · `GET /suppliers/:sid/caps` · `GET /caps/:id` | `cap:read` |
| `POST /companies/:cid/caps` `{ supplierId, title, sourceType, sourceRef?, actions[] }` · `PATCH /caps/:id` (draft) · `POST /caps/:id/actions` · `PATCH /cap-actions/:id` (due-date extension after issue needs `reason`) · `POST /cap-actions/:id/cancel` `{ reason }` | `cap:manage` |
| `POST /caps/:id/issue` `{ contactEmail, responseRequired }` · `POST /caps/:id/cancel` `{ reason }` · `POST /caps/:id/links:reissue` | `cap:manage` |
| `POST /caps/:id/responses/:round/accept` · `…/request-changes` `{ comment }` | `cap:manage` |
| `POST /cap-actions/:id/verify` · `POST /cap-actions/:id/reject` `{ comment }` · `POST /caps/:id/close` `{ note }` | `cap:verify` |
| `POST /caps/:id/suspension` `{ decision: 'suspend' \| 'lift', reason }` | `cap:manage` |
| `GET/PUT /workspaces/current/cap-policy` | `cap:read` / `cap:manage` |
| Supplier side (linked supplier workspace): `GET /customer-caps?status=` · `GET /customer-caps/:id` · `POST /customer-caps/:id/response` `{ rootCause, measures[] }` · `POST /customer-cap-actions/:id/submit` `{ status, note, fileIds }` | `cap:respond` |
| Public (`@Public()`, token in path, rate-limited): `GET /public/caps/:token` · `POST /public/caps/:token/response` · `POST /public/caps/:token/actions/:actionId/submit` · `POST /public/caps/:token/uploads` (upload intent, purpose `cap_evidence`) | token |

Plan and action responses include `allowedTransitions` for the caller, `overdueDays` and `escalationLevel` (all from the engine), so the UI never computes them. Invalid transitions answer 409 `invalid_state_transition`; submitting without required evidence answers 400 `validation_failed`; an expired or revoked token answers 400 `invalid_token`.

## 9. UI
- `/companies/:cid/performance` tabs: **Actions** (board by status + table), **KPIs** (table with sparkline, latest value, target, status pill), **Data entry** (spreadsheet grid: KPIs × periods, paste from Excel, evidence icon per cell), **Targets**.
- KPI detail: line chart with target band and action annotations (design system §6.4), values table, history.
- Project tab `/projects/:pid/actions`: actions linked to this project's issues + "Suggested" panel.

Supplier corrective action plans (`corrective-actions`, Calm Ledger 02 §9; nav **Corrective actions** in the "Due diligence" group gated by `cap:read` + `due_diligence`, locked-module panel otherwise):
- `/corrective-actions` — list page: 4 `StatTile`s (open plans, overdue actions, awaiting verification, suspension recommended) → URL-synced tabs Open · Overdue · Awaiting verification · Closed · All → filter chips (supplier, severity, escalation level, source, owner) → `DataTable` (ref, supplier, title, severity badge, actions done/total as `ProgressBar`, next due date with overdue chip, status pill, escalation step). Empty state explains CAPs and offers "New corrective action plan"; skeleton; error with retry.
- `/corrective-actions/:id` — detail: header (ref, supplier link, status pill, severity, due date, primary action by state: Issue · Accept response · Close plan) → escalation ladder (Reminder → Overdue → Escalated → Suspension recommended; current step with icon + label) → suspension banner with "Suspend supplier" / "Keep active" decision dialog → tabs **Actions** (table with finding ref + link to the M23 finding, due date, status, verification, evidence count; Verify/Reject row actions) · **Responses** (rounds as a `Timeline`, accept / request changes) · **Files** · **Activity**.
- `/suppliers/:sid/corrective-actions` — exported as `supplierCapsRoute` and composed by the router into M19 `supplierDetailRoute(extraTabs)`.
- Supplier in-app `/customer-actions` (+ `/customer-actions/:id`) for linked suppliers with `cap:respond`, linked from M20 "My customers": plans by customer, response form, per-action progress with `FileDropzone`.
- Public `/cap/:token` — public minimal shell (M08 public entry): plan summary, response form (root cause, measure + planned date per action), then per-action submission with evidence; save & resume; 360px, RTL, language switch.

## 10. Events & notifications
`action.created|status_changed|overdue`, `kpi.value.submitted|approved|rejected`, `data_request.created|due_soon|overdue`.

Supplier corrective action plans (`corrective-actions`):

| Event | Payload | Consumers |
|---|---|---|
| `cap.issued` | `{ capId, ref, workspaceId, companyId, supplierId, severity, dueDate, actionCount }` | notifications, monitoring |
| `cap.overdue` | `{ capId, actionId, workspaceId, companyId, supplierId, severity, dueDate, daysOverdue }` | monitoring (alert), risk (residual factor) |
| `cap.escalated` | `{ capId, workspaceId, supplierId, level: 3 \| 4, recommendation?: 'suspend' }` | monitoring |
| `cap.suspension_decided` | `{ capId, workspaceId, supplierId, decision: 'suspend' \| 'lift', reason, decidedBy }` | supplier-register (status), monitoring, risk |
| `cap.closed` | `{ capId, workspaceId, companyId, supplierId, findingIds[], closedAt }` | dd-audits (close findings), risk, monitoring (resolve alerts), grievances (mark the linked measure done) |
| `cap.cancelled` | `{ capId, workspaceId, supplierId, reason }` | monitoring |

Consumes: `finding.raised` (M23) → add an action to the draft CAP of that audit and supplier (idempotent on finding id); `finding.withdrawn` → cancel that action (plan cancelled when no action remains); `grievance.substantiated` (M25) → one draft CAP per named supplier with `source_type = 'grievance'`, `source_ref = caseId` and one action titled from the category (idempotent on case + supplier); `supplier.linked` / `supplier.unlinked` (M20) → update `cap_supplier_links` and set or clear `supplier_workspace_id` on that supplier's open plans; `supplier.archived` (M19) → cancel draft plans. Notifications (category `corrective_actions`): issue, response received, changes requested, action submitted, rejected, reminder, overdue, escalation, suspension decision — to both parties. Every supplier-side read of a CAP and every decision is audited (M12).

## 11. Migration
Each legacy `actionAndKPIs` → one `action` (title = action text, origin `manual`, link to issue) + one `kpi` (name = kpi text, unit `unknown` → needs review flag) + `kpi_targets` (baseline from `baselinePerformance`, targets from `projectPerformance.targetPerformance`) + `kpi_values` (annual periods from `projectPerformance.performance` by `year`).

Supplier CAPs: legacy has none (no findings, no corrective actions); nothing is migrated. Off-platform suppliers with legacy compliance `Noncompliant` are not turned into CAPs (M19 handles that status).

## 12. Test plan
Progress formula (both directions, baseline = target), formula KPIs (division by zero, missing inputs), approval segregation, period locking, grid paste parsing (locales with comma decimals).

Supplier CAPs: engine table tests for the state machine (every allowed and refused transition), due-date defaults, escalation ladder boundaries (day before/after each threshold, critical shortcut, pending verification pauses escalation, due-date extension) and property tests (level monotonic in `today`, never > 4, plan level = max of actions); e2e `test/corrective-actions-lifecycle.e2e-spec.ts` (US-09-5–7, 9), `test/corrective-actions-escalation.e2e-spec.ts` (US-09-8 with a fixed clock, idempotent scans), `test/corrective-actions-supplier-access.e2e-spec.ts` (US-09-10: supplier workspace read policy, token scope, other buyer 404); Playwright journeys "issue CAP" and "supplier responds by token" with axe.

## 13. Open questions

Supplier CAPs (`corrective-actions`):
1. **Suspension effect** — what does "suspended" block? Recommended: M19 shows the "Suspended" status (it consumes `cap.suspension_decided`); blocking new questionnaire campaigns would need M21 to consume the event too (not in its contract yet); ordering systems are out of scope, so suspension is informational plus an export field.
2. **Who verifies?** Should the verifier differ from the CAP owner (four-eyes)? Recommended: not enforced in v1, recorded in the audit trail; make it a workspace policy later.
3. **Escalation defaults** (7 / 14 / 30 days, critical 7) — global or per buyer? Recommended: engine defaults with the per-workspace `cap_policies` override from day one (it is a settings form, no formula change).
4. **Supplier in-app view** requires the supplier to be linked (M20). Recommended: the token link stays the primary channel for every supplier; the in-app view is added for linked suppliers in the same build, not a later phase.

## 14. Module contract

Filled by `/module-contract` (`06-modular-build.md` §2.1, §3). This spec holds two folders: the performance-management module (actions, KPIs, targets; folder to be named when its contract is written) and `corrective-actions` below.

### 14.1 corrective-actions

Folder: `src/modules/corrective-actions/` · `src/features/corrective-actions/` · Wave: 3 · Plan: SD09

| | |
|---|---|
| Owns | Tables `cap_plans`, `cap_actions`, `cap_responses`, `cap_events`, `cap_response_links`, `cap_supplier_links`, `cap_policies` (RLS; supplier-side read policy on `supplier_workspace_id`). Routes `/v1/companies/:cid/caps`, `/v1/caps/*`, `/v1/cap-actions/*`, `/v1/suppliers/:sid/caps`, `/v1/workspaces/current/cap-policy`, `/v1/customer-caps*`, `/v1/customer-cap-actions/*`, `/v1/public/caps/*`. Permissions `cap:read`, `cap:manage`, `cap:verify` (entitlement `due_diligence`), `cap:respond` (no entitlement). i18n namespace `corrective-actions`. FE routes `/corrective-actions*`, `/suppliers/:sid/corrective-actions`, `/customer-actions*`, public `/cap/:token` |
| Public surface (`index.ts`) | `CorrectiveActionsModule` (app.module, worker.ts) · `CapEvents` (event name constants for monitoring, risk, dd-audits, supplier-register) · `CapQuery.capStatusFor(workspaceId, supplierId)` → `SupplierCapStatus { open, overdue, maxLevel, suspensionState }` (risk backfill, screening, dd-reporting, 02 §9.5 dashboard tile) · `CapQuery.listSupplierActions(workspaceId, companyId)` → `ActionReadModel[]` in the M09 action shape (`origin='supplier'`) for the future M09 performance board · types `SupplierCapStatus`, `ActionReadModel` · FE: `correctiveActionsRoutes`, `supplierCapsRoute` (tab child of the M19 supplier detail, `handle.tab`), `customerActionsRoutes` (linked from M20 "My customers"), `publicCapRoutes` (public entry `src/public/`) |
| Depends on | `supplier-register` `SupplierRegisterService.getSupplier`, `primaryContact` (name, buyer company, default contact email; `supplier_workspace_id` comes from the `supplier.linked` event, not an import of `supplier-portal`) — fake `__tests__/fakes/supplier-register.fake.ts` · `files` upload intent (incl. token-scoped purpose `cap_evidence`) + file read model — `files.fake.ts` · `notifications` `notify()` + event bus — `notifications.fake.ts` · `audit` `AuditService` · `identity` `decidePermission`. No dependency on `dd-audits`: findings arrive only as `finding.raised` events and are kept as a snapshot |
| Emits | `cap.issued`, `cap.overdue`, `cap.escalated`, `cap.suspension_decided`, `cap.closed`, `cap.cancelled` (payloads §10) |
| Consumes | `finding.raised` → action on the draft CAP (idempotent) · `finding.withdrawn` → cancel that action · `grievance.substantiated` → draft CAP per supplier · `supplier.linked` / `supplier.unlinked` → `cap_supplier_links` + `supplier_workspace_id` on open plans (cleared on unlink) · `supplier.archived` → cancel drafts |
