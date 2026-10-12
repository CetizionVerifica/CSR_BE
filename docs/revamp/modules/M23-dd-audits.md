# M23 — Supplier audits & assessments (desk reviews, on-site audits, findings)

> Status: Draft · Phase: C (plan SD08) · Wave: 4 · Depends on: M19 supplier-register, M14 files, M13 reference-data (checklist templates, finding categories), M12 notifications · Blocks: M09 §14 corrective-actions (consumes `finding.raised`), M22 risk (residual factor), M24 monitoring
> Split from: M10 §3 (physical-audit flag), §4.1 (access request "physical audit flag per link/year"), §11 (`physicalAudit` mapping)
> Legacy code: BE `project.supplierProperties[].physicalAudit` (boolean per supplier link and year, set when a supplier shares a project) · FE `suppliers/*` (checkbox only), `common/enum/auditQuestions.js` (ISO 26000 audit checklist, 4 sections, 12 items — content moves to M13 checklists)

## 1. Purpose

Let a buyer plan and run **audits of its suppliers** — desk reviews of documents and on-site (or remote) audits — with a checklist from the template library, named auditors, a confirmed visit date and a report, and record **findings with a severity** that drive corrective action plans (M09 §14) and the supplier's residual risk (M22). This is the "verify" step of a due diligence process (CSDDD Art. 10, LkSG §6(4)) and replaces the legacy "physical audit" yes/no flag, which said nothing about scope, date, auditor or outcome.

## 2. Users & permissions

| Role (M01) | Can | Permission |
| --- | --- | --- |
| workspace_owner / workspace_admin / partner_admin (procurement lead, compliance officer) | Plan, schedule, assign auditors, approve or return the audit report, withdraw findings, record external audits, cancel | `dd_audit:manage` (+ `dd_audit:conduct`, `dd_audit:read`) |
| auditor (time-boxed, M01) and any member assigned to an audit | Fill the checklist and draft findings **of audits they are assigned to**, upload evidence, submit for review | `dd_audit:conduct` (scoped to assignments by the service) |
| contributor / viewer | Read audits, checklists and findings | `dd_audit:read` |
| supplier contact (public token, no account) | Confirm the visit date or propose another, see the audit scope | token route, rate-limited |

All three permissions need the workspace entitlement `due_diligence` (M02, owner decision 2026-10-04). The M01 `auditor` role is read-only today; this spec gives it `dd_audit:conduct`, which the service narrows to audits the user is assigned to (§13 Q1).

## 3. Current state (legacy)

- The only audit data is `project.supplierProperties[].physicalAudit`, a boolean the supplier ticks when sharing a project with a buyer ("a physical audit was carried out"). No date, auditor, scope, checklist, report or result.
- No findings; non-conformances live in the off-platform register's free-text "assessment result" and the `Noncompliant` default (M10 §3).
- An ISO 26000 audit checklist exists only as a front-end constant (`auditQuestions.js`), unused by supplier screens.

## 4. Scope

### 4.1 Must have (parity + fixes)

- **Legacy flag migrated** to a completed audit record (`type='on_site'`, `source='legacy_flag'`, no checklist, result unknown) so the history stays visible and countable (§11).
- **Record an external audit** that happened outside the platform (third-party report upload, date, firm, result) in one step.

### 4.2 New in the revamp

- **Audit types**: `desk_review` (documents and questionnaire evidence only), `on_site`, `remote` (video walkthrough). Each targets one supplier and optionally one supplier site (M19 sites).
- **Scheduling**: planned window (start/end date), lead auditor + team, optional external audit firm name, supplier notified by email with a token link to **confirm the visit date or propose another**; overlap warning when the lead auditor already has an on-site audit in the same window.
- **Checklists from the template library** (M13 reference-data, e.g. social compliance, environment, anti-corruption, ISO 26000 audit checklist): the template version is **snapshotted** into the audit when it is scheduled, so later template edits never change a running or completed audit.
- **Auditor assignment**: lead, auditor or observer; only members holding `dd_audit:conduct` can be assigned; assignees see the audit in "My work" (M12 inbox).
- **Fieldwork** in the assessment workspace pattern (02 §5): answer each item `conforming · minor NC · major NC · critical NC · N/A`, notes, photo/document evidence (M14), autosave.
- **Findings** with severity `observation · minor · major · critical`, a category from reference data (labour, human rights, health & safety, environment, business ethics, management system), linked checklist item and evidence. Every NC answer requires a finding; observations can be added freely.
- **Review and completion**: the lead submits; a manager approves (findings are raised, `finding.raised` per finding) or returns it with a comment. **Critical findings can be raised immediately** during fieldwork ("Raise now") so zero-tolerance issues reach a CAP at once.
- **Result**: conformance % and `pass · pass_with_findings · fail` computed by the engine (§7); report PDF uploaded or rendered later by dd-reporting.
- Audit programme views: list with filters, upcoming agenda, findings register across suppliers.

### 4.3 Out of scope

- Corrective action plans and their verification (M09 §14 `corrective-actions`); reassessment cycles that decide **when** to audit (M24 `monitoring`, which emits `reassessment.due`); risk scoring (M22); certificates of third-party schemes (M14 `supplier-evidence`); auditor marketplace or invoicing; offline mobile app (phase 2, §13 Q4).

## 5. User stories & acceptance criteria

- **US-23-1** As a compliance officer, I schedule an on-site audit of a supplier site for 3–4 March with the "Social compliance v2" checklist and a lead auditor, so that the supplier and the auditor know what will happen.
  - AC: Given a supplier and a published template, when I schedule with dates, a site and a lead auditor holding `dd_audit:conduct`, then the audit is `scheduled`, the checklist items of that template version are copied into it, the lead auditor gets an in-app + email notification and the supplier contact gets an email with a visit-confirmation link; assigning a member without `dd_audit:conduct` answers 409 `auditor_not_eligible`.
- **US-23-2** As a supplier contact, I confirm the visit date or propose another from the email link, without an account.
  - AC: Given a valid token, when I confirm, then `visit_confirmed_at` is set and the lead auditor is notified; when I propose new dates with a comment, the audit shows "Supplier proposed 10–11 March" and the manager can accept (dates change) or keep the plan; an expired or used token answers 400 `invalid_token`.
- **US-23-3** As an assigned auditor, I work through the checklist, mark items as conforming or non-conforming with notes and photos, and the work is saved as I go.
  - AC: Given an `in_progress` audit I am assigned to, when I answer an item, then it autosaves; when I answer `major NC`, a draft finding of severity `major` linked to the item is created and opened for editing; a user not assigned to the audit answers 403 on write.
- **US-23-4** As an auditor, I raise a critical finding (e.g. child labour indicator) immediately, so that a corrective action plan starts before the audit closes.
  - AC: Given a draft finding of severity `critical`, when I choose "Raise now", then the finding becomes `raised`, `finding.raised` is emitted once and the manager is notified; non-critical findings cannot be raised before approval (409 `invalid_state_transition`).
- **US-23-5** As a manager, I review the submitted audit and approve it, so that its result counts and its findings start corrective actions.
  - AC: Given an `in_review` audit with every item answered or N/A, when I approve, then status is `completed`, the engine sets conformance and result (§7), each draft finding becomes `raised` and emits `finding.raised`, and `dd_audit.completed` is emitted; when items are unanswered the submit answers 409 `checklist_incomplete` listing the item codes; when I return it with a comment, it goes back to `in_progress`.
- **US-23-6** As a procurement lead, I record a third-party audit report that happened outside the platform.
  - AC: Given a supplier, when I record type, date, firm, result and upload the report, then a `completed` audit with `source='external'` exists without a checklist and `dd_audit.completed` is emitted with `conformance = null`.
- **US-23-7** As a buyer, I see the legacy "physical audit" information for a supplier as an audit in its history.
  - AC: Given a migrated `physicalAudit = true` for a link and year, then the supplier's Audits tab shows a completed on-site audit for that year labelled "Legacy record — no checklist", excluded from conformance averages.
- **US-23-8** As a compliance officer, I see all open findings across suppliers by severity and category and open the related corrective action plan.
  - AC: Given findings in several audits, when I filter by severity `major`+ and status `raised`, then the findings register lists them with supplier, audit and age, and the page shows each finding's CAP status from the corrective-actions API (`GET /companies/:cid/caps?findingId=`, M09 §14) with a link to the CAP; dd-audits itself never reads CAP data.
- **US-23-9** As a workspace member of another workspace, I can never see this workspace's audits, findings or visit links.
  - AC: Given an audit id of workspace A, when a user of workspace B requests it, then the API answers 404.

## 6. Domain model

```ts
dd_audits {
  id uuid, workspace_id → workspaces, company_id → companies (buyer), supplier_id uuid (M19, no FK), site_id uuid? (M19 site, no FK),
  reporting_year smallint, type: 'desk_review' | 'on_site' | 'remote',
  source: 'manual' | 'cycle' | 'external' | 'legacy_flag', source_ref text?,       -- cycle = monitoring reassessment id
  title text, scope text?, checklist_template_code text?, checklist_template_version int?,
  status: 'planned' | 'scheduled' | 'in_progress' | 'in_review' | 'completed' | 'cancelled',
  planned_start date?, planned_end date?, proposed_start date?, proposed_end date?, proposal_comment text?, visit_confirmed_at timestamptz?,
  audit_firm text?, conformance numeric(5,1)?, result: 'pass' | 'pass_with_findings' | 'fail' | null,
  report_file_id → files?, review_comment text?, cancelled_reason text?,
  completed_at timestamptz?, approved_by → users?, created_by → users, created_at, updated_at, legacy_ref text?
}
dd_audit_assignments { workspace_id, audit_id → dd_audits, user_id → users, role: 'lead' | 'auditor' | 'observer', primary key(audit_id, user_id) }
dd_audit_items {                                          -- snapshot of the template at scheduling time
  id, workspace_id, audit_id → dd_audits, section_code, item_code, position int, text jsonb (locale → text), guidance jsonb?,
  answer: 'conforming' | 'minor_nc' | 'major_nc' | 'critical_nc' | 'not_applicable' | null,
  notes text?, file_ids uuid[] (→ files), answered_by → users?, answered_at?, unique(audit_id, item_code)
}
dd_findings {
  id, workspace_id, company_id → companies, audit_id → dd_audits, supplier_id uuid, item_id → dd_audit_items?,
  ref text (e.g. 'F-2026-0042', unique per workspace), title, description?, severity: 'observation' | 'minor' | 'major' | 'critical',
  category_code text (reference-data), file_ids uuid[], status: 'draft' | 'raised' | 'withdrawn' | 'closed',
  raised_at?, raised_by?, withdrawn_reason?, closed_at?, closed_by_cap_id uuid?, created_by, created_at, updated_at
}
dd_audit_visit_links { id, workspace_id, audit_id → dd_audits, email_hash, token_hash unique, expires_at, used_at?, created_at }
```

- All tables carry `workspace_id`, `ENABLE` + `FORCE ROW LEVEL SECURITY` and the `app_current_workspace()` policy. Foreign keys only to kernel tables (`workspaces`, `companies`, `users`, `files`) and inside the module; `supplier_id`/`site_id` are plain uuids validated through `supplier-register`'s `getSupplier`.
- Indexes: `dd_audits(workspace_id, supplier_id, status)`, `dd_audits(workspace_id, planned_start)`, `dd_findings(workspace_id, status, severity)`, `dd_audit_assignments(user_id)`.
- The public visit route resolves `token_hash` through a narrow `SECURITY DEFINER` lookup that returns the workspace id, then runs inside `withTenant` (same pattern as M08 public surveys).

## 7. Business rules & calculations

### 7.1 Audit state machine

```
planned ──schedule──▶ scheduled ──start──▶ in_progress ──submit──▶ in_review ──approve──▶ completed
   │                     │                     ▲                      │
   │                     │                     └──────return──────────┘
   └──────────cancel─────┴───────cancel────────┘ (any state before completed) ──▶ cancelled
record-external: (none) ──▶ completed            legacy migration: (none) ──▶ completed
```

- `schedule` requires `planned_start ≤ planned_end`, a lead auditor eligible for `dd_audit:conduct`, and (except `desk_review`) a supplier contact email; it snapshots the checklist template and issues a visit link (on-site/remote only).
- `start` by an assignee or a manager; allowed from `scheduled` on or after `planned_start − 1 day` (desk reviews any time).
- `submit` by the lead (or a manager) requires every item answered (`not_applicable` counts as answered) and every item with an NC answer to have at least one non-withdrawn finding linked → otherwise 409 `checklist_incomplete` with the offending `item_code`s.
- `approve` / `return` by `dd_audit:manage`; the approver may not be the lead auditor of the same audit (four-eyes, §13 Q2). `return` requires a comment.
- `cancel` requires a reason; raised findings of a cancelled audit stay raised (their CAPs continue).
- Completed audits are read-only; corrections go through a new audit or a finding withdrawal (audited).
- Supplier date proposals never change dates by themselves; a manager accepts (dates replaced, link re-issued) or dismisses.

### 7.2 Checklist answers → findings

| Item answer | Finding required | Default severity |
| --- | --- | --- |
| `conforming`, `not_applicable` | no | — |
| `minor_nc` | yes | `minor` |
| `major_nc` | yes | `major` |
| `critical_nc` | yes | `critical` |

The severity of a finding may be raised above the default but never lowered below it. Observations (`observation`) are free findings with no checklist answer.

### 7.3 Finding lifecycle

`draft → raised` (on audit approval, or immediately via "Raise now" for `critical` only) · `draft|raised → withdrawn` (manager, reason required; emits `finding.withdrawn`) · `raised → closed` (only from the `cap.closed` event naming the finding; emits `finding.closed`). `ref` is assigned on creation: `F-<reporting_year>-<4-digit sequence per workspace>`.

### 7.4 Conformance and result (`engine/audit-result.ts`, pure)

Let C, m, M, K be the counts of items answered `conforming`, `minor_nc`, `major_nc`, `critical_nc` (N/A excluded).

- `conformance = round1(100 × C / (C + m + M + K))`; `null` when the denominator is 0 (desk review with no applicable item, external or legacy audits).
- `result = 'fail'` if K ≥ 1 or conformance < 60 · `'pass_with_findings'` if M ≥ 1 or conformance < 80 · otherwise `'pass'`. Thresholds are the engine defaults; per-workspace thresholds are a later change (§13 Q3).
- External audits take the result entered by the user (`pass|pass_with_findings|fail`) and `conformance = null`; legacy audits have both `null`.
- The engine also returns `findingSummary = { observation, minor, major, critical }` counted from non-withdrawn findings, used in `dd_audit.completed`.

### 7.5 Scheduling rules (`engine/schedule.ts`, pure)

- `overlaps(a, b)` — two on-site/remote audits of the same lead auditor whose `[planned_start, planned_end]` intersect → warning `auditorOverlap` in the response, never a block.
- Visit link expiry = `planned_end + 1 day`; one active link per audit (re-issuing revokes the previous).

## 8. API contract (REST `/v1`)

| Route | Permission |
| --- | --- |
| `GET /companies/:cid/dd-audits?status=&type=&supplierId=&from=&to=&assignee=me&cursor=` | `dd_audit:read` |
| `POST /companies/:cid/dd-audits` `{ supplierId, siteId?, type, title, scope?, templateCode?, reportingYear }` (status `planned`) | `dd_audit:manage` |
| `GET /dd-audits/:id` · `PATCH /dd-audits/:id` (planned/scheduled only: title, scope, dates, site, firm) | `dd_audit:read` / `dd_audit:manage` |
| `PUT /dd-audits/:id/assignments` `[{ userId, role }]` | `dd_audit:manage` |
| `POST /dd-audits/:id/schedule` `{ plannedStart, plannedEnd, contactEmail? }` · `…/start` · `…/submit` · `…/approve` · `…/return` `{ comment }` · `…/cancel` `{ reason }` | `dd_audit:manage`; `start`, `submit`: `dd_audit:conduct` (assignee) |
| `POST /dd-audits/:id/proposal/accept` · `…/proposal/dismiss` | `dd_audit:manage` |
| `GET /dd-audits/:id/items` · `PUT /dd-audits/:id/items/:itemCode` `{ answer, notes, fileIds }` | `dd_audit:read` / `dd_audit:conduct` (assignee) |
| `GET /dd-audits/:id/findings` · `POST /dd-audits/:id/findings` · `PATCH /dd-findings/:id` (draft only) | `dd_audit:read` / `dd_audit:conduct` (assignee) |
| `POST /dd-findings/:id/raise` (critical only, before approval) | `dd_audit:conduct` (assignee) |
| `POST /dd-findings/:id/withdraw` `{ reason }` | `dd_audit:manage` |
| `GET /companies/:cid/dd-findings?severity=&status=&category=&supplierId=&cursor=` (findings register) | `dd_audit:read` |
| `POST /companies/:cid/dd-audits:record-external` `{ supplierId, siteId?, type, date, auditFirm, result, reportFileId, reportingYear }` | `dd_audit:manage` |
| `GET /suppliers/:sid/dd-audits` (supplier tab, newest first) | `dd_audit:read` |

Public (token in path, rate-limited per IP and token, no auth header, `@Public()`):

| Route | Behaviour |
| --- | --- |
| `GET /public/audit-visits/:token` | Buyer company name and logo, audit type, scope, site, planned dates, language list |
| `POST /public/audit-visits/:token/confirm` | Sets `visit_confirmed_at`, marks the link used |
| `POST /public/audit-visits/:token/propose` `{ start, end, comment }` | Stores the proposal, notifies the lead and managers |

Audit and finding responses include `allowedTransitions` (computed by `engine/audit-state.ts` for the caller) so the UI never decides which action is available.

New problem types: `checklist_incomplete` (409, extension `itemCodes`), `auditor_not_eligible` (409). Transitions not allowed from the current state answer 409 `invalid_state_transition`.

## 9. UI

Calm Ledger (02 §9): one entrance per view (`--motion-enter` on cards/rows, `--motion-grow` on conformance bars), reduced motion = final values; nav entry **Audits** in the "Due diligence" group, gated by `dd_audit:read` + entitlement `due_diligence` (locked-module panel otherwise). Routes avoid `/audit`, which is the M12 audit log.

- **`/supplier-audits`** — list page (02 §5). URL-synced tabs: **Programme** (table: supplier, site, type, dates, lead, status pill, result badge, open findings) · **Agenda** (next 90 days grouped by week, on-site/remote only) · **Findings** (findings register, US-23-8). Filter chips: status, type, year, result, severity, assignee "me". Primary action "Plan audit" (sheet); secondary "Record external audit". Loading: table skeleton (8 rows); empty: explains audits and offers "Plan audit" + "Record external audit"; error: retry.
- **Plan / schedule sheet** — two steps in a `Sheet`: what (supplier combobox from the generated suppliers hook, site, type, template, title, scope) → when & who (date range, lead auditor + team with eligibility shown, contact email prefilled from supplier contacts, overlap warning inline `Alert`). Problem+json mapped to fields.
- **`/supplier-audits/:id`** — detail page: header (title, supplier link, type, status pill, dates, "Visit confirmed"/"Supplier proposed …" badge, one primary action by state: Schedule · Start · Submit · Approve) → tabs **Overview** (scope, team, `StatTile`s: conformance %, findings by severity, items answered x/y; result badge with icon + label) · **Checklist** · **Findings** · **Files** · **Activity** (M12 feed). Return/cancel/withdraw through `ConfirmDialog` with required reason.
- **`/supplier-audits/:id/checklist`** — assessment workspace (02 §5): navigator (sections with answered/NC counts) · item card with a 5-option `RadioGroup` (`1`–`5` keys), notes, evidence `FileDropzone` (M14 upload intent, photos allowed) · context panel (guidance, linked findings, comments). Autosave (800ms, "Saved · 2s ago"), `J/K` next/previous, filter "unanswered only" and "non-conformities only", sticky submit bar with completion %. An NC answer opens the finding editor inline; read-only for viewers and after completion.
- **Findings editor** — `Sheet`: title, description, severity (`RadioGroup`, lower options disabled below the item's default), category select, evidence; critical findings show "Raise now" with a confirm dialog explaining that a corrective action plan will start.
- **Supplier tab** `/suppliers/:sid/audits` — exported as `supplierAuditsRoute` and composed by the router into M19 `supplierDetailRoute(extraTabs)`: audit history table + "Plan audit" prefilled with the supplier; legacy audits show a "Legacy record — no checklist" badge.
- **Public visit page** `/audit-visit/:token` — public minimal shell (02 §3, M08 public entry): buyer logo, audit summary, dates, two actions "Confirm these dates" / "Propose other dates" (date range + comment); success and expired-link states; mobile-first at 360px, RTL.
- Charts: conformance by section on the Overview tab as `ResiliChart` horizontal bars in fixed template section order with "View as table"; no other charts.

## 10. Events, notifications & audit

| Event (emitted) | Payload | Consumers |
| --- | --- | --- |
| `dd_audit.scheduled` | `{ auditId, workspaceId, companyId, supplierId, type, plannedStart, plannedEnd, leadUserId }` | monitoring (the auditor and supplier emails are sent by dd-audits itself) |
| `dd_audit.completed` | `{ auditId, workspaceId, companyId, supplierId, siteId?, type, source, result, conformance, findingSummary, completedAt, reportingYear }` | risk (residual factor), monitoring (reassessment done), dd-reporting |
| `dd_audit.cancelled` | `{ auditId, workspaceId, supplierId, reason }` | monitoring |
| `finding.raised` | `{ findingId, ref, workspaceId, companyId, supplierId, auditId, severity, categoryCode, title, raisedAt }` | corrective-actions (draft CAP), risk, monitoring (critical → alert) |
| `finding.withdrawn` | `{ findingId, workspaceId, supplierId, severity, reason }` | corrective-actions (cancel the linked action), risk, monitoring |
| `finding.closed` | `{ findingId, workspaceId, supplierId, severity, capId, closedAt }` | risk (finding stops counting), monitoring |

Consumes: `cap.closed` (`{ capId, findingIds[] }`) → those findings `closed`; `reassessment.due` (M24, `kind = 'audit'`) → a `planned` audit with `source='cycle'`; `supplier.archived` (M19) → planned/scheduled audits cancelled with reason "supplier archived".

Notifications (dd-audits calls M12 `notify()` for members and `sendEmail()` for the supplier contact; category `dd_audits`): assignment, visit confirmed/proposal received, audit submitted (managers), audit returned (lead), audit completed (team), critical finding raised (managers). Audit entries (M12) for every transition, assignment change, item answer change, finding create/edit/raise/withdraw, public-link use (hashed IP).

## 11. Migration from legacy

- For every legacy supplier link and year with `project.supplierProperties.physicalAudit = true`: one `dd_audits` row `{ type: 'on_site', source: 'legacy_flag', status: 'completed', reporting_year, completed_at: project completion date or 1 Jan of the year, conformance: null, result: null, title: 'Physical audit (legacy record)', legacy_ref: '<projectId>:<companyId>' }` in the buyer's workspace, `supplier_id` from the M19 migration map. No findings, no checklist.
- The legacy `auditQuestions.js` checklist becomes the M13 template `iso26000_audit` v1 (M13 owns the import).
- This replaces the M10 §11 mapping `project.supplierProperties.physicalAudit → supplier_access.physical_audit`.
- Golden check: count of legacy `physicalAudit = true` per buyer = count of `legacy_flag` audits.

## 12. Test plan

- Engine: `audit-result.spec.ts` table-driven (all N/A → null, one critical → fail regardless of %, 79.9/80/59.9/60 boundaries, observations ignored in %, withdrawn findings excluded from the summary); `audit-result.property.spec.ts` (conformance ∈ [0,100], adding a conforming item never lowers it, any critical → fail); `schedule.spec.ts` (overlap edges, same-day audits, desk reviews ignored).
- E2e `test/dd-audits-lifecycle.e2e-spec.ts` (US-23-1, 3, 4, 5, 6: full lifecycle, invalid transitions, `checklist_incomplete`, four-eyes approval, non-assignee 403), `test/dd-audits-public.e2e-spec.ts` (US-23-2: confirm/propose, expired/used token, rate limit), `test/dd-audits-findings.e2e-spec.ts` (US-23-8: register filters, `cap.closed` closes findings, withdrawal emits event), `test/dd-audits-tenancy.e2e-spec.ts` (US-23-9: other workspace 404 on every route incl. visit links), migration fixture test for US-23-7. Extend `route-authorization`, `route-access-matrix`, `tenancy-rls`.
- Frontend: checklist keyboard flow and autosave, finding severity floor, state-driven primary action, public page at 360px + RTL, axe on all pages; Playwright journey "plan → schedule → checklist → submit → approve".

## 13. Open questions

1. **Who conducts audits?** The M01 `auditor` role is read-only for assurance providers. Recommended: grant it `dd_audit:conduct`, enforced only on audits the user is assigned to, and update M01 §2 ("read-only except DD audits they are assigned to"); external audit firms are invited as time-boxed `auditor` members.
2. **Four-eyes on approval** (approver ≠ lead auditor)? Recommended: yes, always; a one-person workspace records the audit as external instead.
3. **Result thresholds** (60/80, any critical = fail) global or per buyer? Recommended: engine defaults now, per-workspace settings in a later change together with M22 risk thresholds.
4. **Offline fieldwork** on sites without connectivity? Recommended: not in v1; the checklist autosaves and tolerates short outages with a retry queue; an offline-capable PWA is a phase 2 item.
5. **Supplier-declared third-party audits** (legacy: the supplier ticked "physical audit")? Recommended: suppliers upload third-party audit reports as M14 `supplier-evidence` certificates of type `third_party_audit_report`; buyers turn one into an external audit record with one click.

## 14. Module contract

Filled by `/module-contract` (`06-modular-build.md` §2.1, §3). Folder: `src/modules/dd-audits/` · `src/features/dd-audits/` · Wave: 4

| | |
| --- | --- |
| Owns | Tables `dd_audits`, `dd_audit_assignments`, `dd_audit_items`, `dd_findings`, `dd_audit_visit_links` (RLS). Routes `/v1/companies/:cid/dd-audits*`, `/v1/dd-audits/*`, `/v1/dd-findings/*`, `/v1/companies/:cid/dd-findings`, `/v1/suppliers/:sid/dd-audits`, `/v1/public/audit-visits/*`. Permissions `dd_audit:read`, `dd_audit:conduct`, `dd_audit:manage` (entitlement `due_diligence`). Problem types `checklist_incomplete`, `auditor_not_eligible`. i18n namespace `dd-audits`. FE routes `/supplier-audits*`, `/suppliers/:sid/audits`, public `/audit-visit/:token` |
| Public surface (`index.ts`) | `DdAuditsModule` (app.module, worker.ts) · `DdAuditEvents` (event name constants: risk, monitoring, corrective-actions, dd-reporting subscribe) · `FindingsQuery.getFinding(workspaceId, id)` / `listFindings(workspaceId, filter)` → `FindingReadModel` (dd-reporting, monitoring drill-down; corrective-actions does **not** call it — it keeps the snapshot from `finding.raised`, so no wave-3 → wave-4 dependency) · `AuditsQuery.latestAuditFor(workspaceId, supplierId)` → `AuditSummary` (risk backfill, screening, dd-reporting) · types `FindingReadModel`, `AuditSummary`, `FindingSeverity` · FE: `ddAuditsRoutes`, `supplierAuditsRoute` (tab child of the M19 supplier detail, `handle.tab`), `publicAuditVisitRoutes` (public entry `src/public/`) |
| Depends on | `supplier-register` `SupplierRegisterService.getSupplier`, `listSites`, `primaryContact` (existence, name, site, visit email) — fake `__tests__/fakes/supplier-register.fake.ts` · `files` upload intent + file read model (`status = ready` check) — `files.fake.ts` · `reference-data` checklist template by code + version, finding categories — `reference-data.fake.ts` · `notifications` `notify()`, `sendEmail()` (visit link to the supplier contact), `EventBus.publish` + `OnDomainEvent` — `notifications.fake.ts` · `identity` `decidePermission` (assignee eligibility) · `audit` `AuditService` |
| Emits | `dd_audit.scheduled`, `dd_audit.completed`, `dd_audit.cancelled`, `finding.raised`, `finding.withdrawn`, `finding.closed` (payloads §10) |
| Consumes | `cap.closed` → close the named findings · `reassessment.due` (`kind='audit'`) → planned audit, `source='cycle'` · `supplier.archived` → cancel planned/scheduled audits |
