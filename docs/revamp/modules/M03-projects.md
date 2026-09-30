# M03 — Projects (assessment cycles) & Project Journey

> Status: Draft · Phase: 2 · Depends on: M01, M02 · Blocks: M04–M11, M16
> Legacy code: BE `server/models/project.js`, `schema/mutations/project/*` (esp. `update.js` `changeProjectStatus`, `submitProjectAssessmentStatus`), `queries/project/*`, `controllers/projects.js` · FE `project/*`, `performance/*` (home timeline), `common/enum/projectStatuses.js`

## 1. Purpose
A **project** is one assessment/reporting cycle of one company for one reporting year (e.g. "Acme Ltd — 2026"). It bundles the workstreams the company is entitled to — gap analysis, documentation assessment, materiality, actions & KPIs, framework coverage, (later) carbon — and shows the team where they are and what to do next.

## 2. Users & permissions
| Role | Can |
|---|---|
| workspace_admin / owner, partner_admin | Create, configure, archive, delete projects; assign members |
| contributor | Work on assigned workstreams/sections |
| viewer / auditor | Read |
| platform_assessor | Read projects in review states (M05) |

## 3. Current state (legacy)
- One linear status field: `New → FirstAssessmentRequest → FirstAssessmentCompleted → SecondAssessmentRequest → Completed → MaterialitySendSurvey → MaterialityCompleted → Finished`. Transitions are chosen **in the browser** (`changeProjectStatus` accepts any string; enum not validated because `updateItem` skips validators). `Finished` is only set by an FE button.
- Edit/upload locks per status live in the FE (`GapEdit`, `SubmitForAssessment`).
- `addProject` creates an empty gap analysis and a materiality doc with the company "self" stakeholder (credits 250, weight 0.5).
- Home page (`performance/index.js`) shows a 7-step timeline and result widgets but **spins forever** unless the company has all three licences.
- Project settings/delete tabs commented out; `removeProject` broken; export stubs empty; no year-uniqueness check.

## 4. Scope
### 4.1 Must have
- Create project wizard: company, reporting year (unique per company, unless "additional assessment" flag), title, period start/end (defaults from company fiscal year), employee count snapshot, workstreams to include (limited by entitlements), frameworks (M16), gap-analysis review mode (see §7), members & roles.
- **Workstream state machines enforced server-side** (§7) with explicit transition endpoints; every transition audited and notified.
- Edit locks enforced server-side (e.g. answers read-only while under review).
- **Project journey** (replaces the 7-step timeline): per workstream progress %, current step, blocking items, next best action button, due dates.
- Project dashboard (`/projects/:id`): header (company, year, status, owner, due date), journey, key results (gap score, top material issues, KPI progress) — each widget independently loads/empties (never blocks on other modules).
- Project list with filters (company, year, status, workstream state, assessor), saved views, CSV export.
- Members & assignments: assign people to workstreams or specific core subjects/issues (feeds M04 assignment and M12 notifications).
- Due dates & reminders per workstream.
- Archive / unarchive; soft delete with restore; **duplicate project for next year** (copies configuration, members, stakeholders selection, optionally previous answers as "carried forward — needs confirmation").
- Year-over-year comparison link (M11).

### 4.2 New
- Configurable review mode: `platform_review_2_rounds` (legacy default), `platform_review_1_round`, `self_assessed` (no platform assessor; for cheaper plans), `third_party_auditor` (external auditor user reviews).
- Project templates (per partner) with pre-selected workstreams, frameworks and due-date offsets.

### 4.3 Out of scope
- Gantt/resource planning.

## 5. User stories & acceptance criteria
- **US-03-1** As a workspace admin I create "2026" for Acme with gap + materiality + actions; if a 2026 project already exists the wizard offers to open it or create an "additional assessment".
- **US-03-2** As a contributor I open the project and the journey tells me "Gap analysis · 212/609 answered · 14 missing evidence · Next: Human rights (assigned to you)".
- **US-03-3** As a workspace admin I cannot submit the gap analysis for review while mandatory items are missing; the API returns `invalid_state_transition` with the list of blockers, and the UI shows them grouped by core subject.
- **US-03-4** As a workspace admin I duplicate "2025" into "2026" with answers carried forward; each carried-forward answer is flagged until confirmed.
- **US-03-5** The dashboard loads for a company entitled only to `gap` without errors (materiality/KPI widgets hidden).

## 6. Domain model
```ts
projects { id, workspace_id, company_id, reporting_year smallint, title, period_start date, period_end date,
           employee_count?, status: 'draft'|'active'|'completed'|'archived', review_mode, is_additional boolean default false,
           owner_user_id, due_date?, template_id?, copied_from_project_id?, legacy_project_id?,
           created_at, updated_at, deleted_at?,
           unique(company_id, reporting_year) where is_additional = false and deleted_at is null }
project_workstreams { id, workspace_id, project_id, kind: 'gap'|'doc_assessment'|'materiality'|'actions'|'frameworks'|'carbon',
                      state text, state_changed_at, state_changed_by, due_date?, config jsonb, unique(project_id, kind) }
project_members { id, workspace_id, project_id, user_id, role: 'lead'|'contributor'|'viewer', unique(project_id, user_id) }
assignments { id, workspace_id, project_id, user_id, scope_type: 'workstream'|'core_subject'|'issue'|'question'|'kpi', scope_ref text, due_date? }
state_transitions { id, workspace_id, project_id, workstream_kind, from_state, to_state, actor_id, reason?, created_at }  -- append-only
```

## 7. State machines (server-enforced)

**Gap workstream** (`review_mode = platform_review_2_rounds`):
```
not_started → in_progress → submitted_r1 → in_review_r1 → reviewed_r1 → submitted_r2 → in_review_r2 → completed
                   ↑              │(withdraw, before review starts)            │
                   └──────────────┘                                            └→ (reopen by platform_owner only, audited)
```
| Transition | Who | Guard |
|---|---|---|
| `not_started → in_progress` | automatic on first answer | — |
| `in_progress → submitted_r1` | admin/lead | readiness check passes (M04 §7.4): every applicable KC answered, relevance set, evidence linked or "no document" chosen |
| `submitted_r1 → in_review_r1` | assessor (claims) | — |
| `in_review_r1 → reviewed_r1` | assessor | every linked file assessed (M05) |
| `reviewed_r1 → submitted_r2` | admin/lead | company may update answers/evidence between rounds (legacy: editable in `FirstAssessmentCompleted`) |
| `in_review_r2 → completed` | assessor | all files assessed; final scores frozen |
`platform_review_1_round` skips r2; `self_assessed` goes `in_progress → completed` with a sign-off by an admin.

Edit rules: answers editable only in `in_progress` and `reviewed_r1`; evidence uploads allowed in `in_progress`, `submitted_r1` (before claim), `reviewed_r1`; everything read-only in `completed` (legacy intent "final assessment is unalterable" — now enforced).

**Materiality workstream**: `not_started → setup → surveys_open → surveys_closed → results_ready → validated`. Legacy required gap `Completed` before sending surveys; **intentional change:** materiality can start independently (CSRD practice runs materiality first); the journey *recommends* an order but does not block.

**Actions workstream**: `not_started → planning → tracking → closed`. Legacy only allowed new actions at `MaterialityCompleted`; new rule: planning can start when materiality is `results_ready` **or** gap is `completed` (actions can come from either).

**Project**: `draft → active` (first workstream starts) `→ completed` (all included workstreams completed/closed, or admin closes with reason) `→ archived`.

Legacy status → new mapping (for migration): `New`→gap `in_progress`; `FirstAssessmentRequest`→`submitted_r1`; `FirstAssessmentCompleted`→`reviewed_r1`; `SecondAssessmentRequest`→`submitted_r2`; `Completed`→gap `completed`; `MaterialitySendSurvey`→gap `completed` + materiality `surveys_open`; `MaterialityCompleted`→ + materiality `results_ready`; `Finished`→ + actions `closed`, project `completed`.

## 8. API contract (REST `/v1`)
| Route | Permission |
|---|---|
| `GET /projects?filter[companyId]=&filter[year]=&filter[status]=&sort=&cursor=` | `project:read` |
| `POST /projects` · `GET/PATCH/DELETE /projects/:id` · `POST /projects/:id/restore` · `POST /projects/:id/archive` | `project:create/configure` |
| `POST /projects/:id/duplicate` `{ year, carryForwardAnswers }` | `project:create` |
| `GET /projects/:id/journey` | `project:read` — progress, blockers, next actions per workstream |
| `GET /projects/:id/dashboard` | `project:read` — read model for widgets |
| `POST /projects/:id/workstreams/:kind/transitions` `{ to, reason? }` | depends on transition (see §7); returns 409 `invalid_state_transition` + `blockers[]` |
| `GET /projects/:id/transitions` | `project:read` |
| `GET/PUT /projects/:id/members` · `GET/POST/DELETE /projects/:id/assignments` | `project:configure` |

## 9. UI
- `/projects` list page pattern; `/projects/new` wizard (Company & year → Scope (workstreams, frameworks, review mode) → Team → Review).
- `/projects/:id` dashboard: journey card at the top (horizontal stepper per workstream on desktop, vertical on mobile; each step shows state pill, % and CTA), result widgets below, activity feed on the side.
- Home `/` for a company user = the active project's dashboard; for partners/platform assessors = portfolio view (M11).
- Transition buttons live in the page header of the workstream ("Submit for documentation review") and open a confirmation dialog that lists what will be locked and who gets notified.

## 10. Events & notifications
`project.created|updated|archived|deleted|duplicated`, `workstream.transitioned` (payload from/to). Notifications (M12): submission → assessors queue + email; review completed → project lead + members; due date in 7/1 days → assignees.

## 11. Migration
Mongo `projects` → `projects` + `project_workstreams` using the mapping in §7; `firstAssessmentDate/secondAssessmentDate` → `state_transitions` rows; `supplierProperties[]` → M10; `users[]` → `project_members`; `archive`/`active` → `status`.

## 12. Test plan
- Unit: every allowed/forbidden transition per review mode and role (table-driven).
- Integration: readiness blockers computed from real data; locks enforced on answer/evidence endpoints.
- E2E: create → answer → submit → review (as assessor) → complete → duplicate next year.

## 13. Open questions
- Keep "additional assessment" (two projects same company/year) or forbid? (Legacy allowed duplicates by accident.)
- Should the materiality-first order become the default journey recommendation for CSRD customers?
