# M24 — Monitoring & alerts (reassessment cycles, signals feed, watchlist screening)

> Status: Draft · Phase: C (plan SD10) · Wave: 4 · Depends on: M19 supplier-register, M22 risk, M12 notifications (event bus) · consumes events of M14 supplier-evidence, M21 questionnaires, M22 risk, M23 dd-audits, M09 §14 corrective-actions, M25 grievances, M26 esg-data · Blocks: M11/M16 dd-reporting (alert read model), the 02 §9.5 dashboard "Needs attention" list
> Split from: M10 §4.2 ("certificate expiry tracking with reminders" — alert side), §10 (`supplier_document.expiring`, `cap.overdue` as alerts); takes over from M12 §2.5 the certificate-expiry alerting (the expiry scan itself belongs to supplier-evidence)
> Legacy code: none — legacy has no monitoring; the only reminder-like code is the broken `server/Cronjob/cronjobs.js` (M12 §3)

## 1. Purpose

Due diligence is continuous (CSDDD Art. 15, LkSG §6(5)): after onboarding, a buyer must notice when something changes at a supplier and re-check it on a schedule. Monitoring turns the facts other modules publish — expiring certificates, overdue corrective actions, risk increases, critical audit findings, overdue questionnaires, grievances, external rating drops — plus its own **sanctions and adverse-media screening** into one **signal feed** and a triage list of **alerts**, and runs **reassessment cycles** that ask for a new questionnaire or audit when a supplier's last assessment is too old for its risk band. Compliance officers and procurement leads use it daily; it feeds the "Needs attention" list of the due diligence dashboard.

## 2. Users & permissions

| Role (M01) | Can | Permission |
| --- | --- | --- |
| workspace_owner / workspace_admin / partner_admin (compliance officer, procurement lead) | Everything below, plus edit alert rules and reassessment cycles, run watchlist screening, confirm or dismiss watchlist matches | `monitoring:manage` (+ triage, read) |
| contributor | Acknowledge, assign, resolve and dismiss alerts | `monitoring:triage` (+ read) |
| viewer / auditor | Read the signal feed, alerts, cycles and screening results | `monitoring:read` |

All three need the workspace entitlement `due_diligence` (M02). Suppliers never see monitoring data.

## 3. Current state (legacy)

- Nothing equivalent. Legacy emails are sent only on assessment completion (M10 §3); certificate expiry is not tracked; no sanctions screening; the cron file is broken (M12 §3).

## 4. Scope

### 4.1 Must have (parity + fixes)

- Certificate expiry becomes visible and actionable (legacy had no expiry at all): `certificate.expiring` events from `supplier-evidence` turn into signals and one alert per certificate.

### 4.2 New in the revamp

- **Signals feed** — an append-only stream of what happened, newest first, per company and per supplier, built only from events and screening results; live in the UI without moving on its own (02 §9.4).
- **Alerts** — one triage object per underlying problem (deduplicated: the `d30` and `d7` notices and the expiry of one certificate are one alert whose severity rises), with status `open → acknowledged → resolved | dismissed`, an assignee and a resolution note; resolved automatically when the source module reports the fix (certificate verified, CAP closed, questionnaire submitted).
- **Alert rules** per workspace: each rule kind can be switched off, given a severity and parameters (e.g. risk delta); defaults apply when a workspace has never edited them.
- **Reassessment cycles** — "re-send the code-of-conduct questionnaire every 12 months to high-risk suppliers, 24 to medium, 36 to low" or "audit high-risk direct suppliers every 24 months"; the daily job marks suppliers due and emits `reassessment.due`, which `questionnaires` and `dd-audits` act on.
- **Watchlist screening** behind adapters: sanctions lists (`ScreeningAdapter`) and adverse media (`AdverseMediaAdapter`), run on supplier creation, on name/country change and on a schedule; potential matches need a human review (confirm / false positive) and confirmed matches raise a critical alert and inform risk.
- **Notifications and digest** through M12: critical alerts immediately, others in the daily digest by user preference.

### 4.3 Out of scope

- Computing risk (M22), certificate expiry dates and reminders to suppliers (M14 `supplier-evidence`), CAP escalation steps (M09 §14 — monitoring only shows them), questionnaire campaigns and audits themselves (M21, M23), screening of individuals (beneficial owners, directors — §13 Q3), continuous news crawling of our own, ranking (SD07 `screening` module — different meaning of "screening").

## 5. User stories & acceptance criteria

- **US-24-1** As a compliance officer, I see one feed of everything that changed across my suppliers, newest first, so that I start my day in one place.
  - AC: Given `certificate.expiring`, `cap.overdue` and `supplier.risk.changed` events for three suppliers, when I open `/monitoring`, then the feed lists three signals newest first with time, severity label, supplier and one line of text, each linking to the source record; signals from another workspace never appear.
- **US-24-2** As a compliance officer, a new signal appears while I read the feed without the list jumping.
  - AC: Given the feed is open, when a new signal arrives at the next poll, then it is inserted at the top with a 180ms fade and announced once by the polite live region; while the pointer is over the feed or focus is inside it, new signals are held back behind a "2 new signals — Show" button; the list never scrolls by itself; with reduced motion there is no fade.
- **US-24-3** As a compliance officer, repeated notices about the same problem form one alert that I can acknowledge, assign and resolve.
  - AC: Given `certificate.expiring` with threshold `d30`, then `d7`, then `certificate.expired` for one certificate, then there are three signals and one alert, opened as warning at `d30` and raised to critical at `d7`, whose history lists all three signals (same dedupe key); `alert.raised` was emitted twice (opening, increase); when `certificate.verified` arrives for a replacement certificate, the alert is resolved automatically with the note "Resolved by source".
- **US-24-4** As a workspace admin, I switch off a rule or change its parameters.
  - AC: Given the rule `risk_increase` with `minDelta = 10`, when I set it to 15, then a risk change of +12 creates no signal and +16 does; when I disable `external_rating_drop`, those events create no signals; rule edits are audited.
- **US-24-5** As a procurement lead, I define a reassessment cycle and suppliers become due automatically.
  - AC: Given a questionnaire cycle with intervals high 12 / medium 24 / low 36 months and lead time 30 days, and a high-risk supplier whose last submission was on 2025-11-10, then on 2026-10-11 the item becomes `due`, `reassessment.due` is emitted once and a signal is added; when `questionnaire.submitted` arrives for that supplier on 2026-11-10, the item is `done` and the next item is due on 2027-11-10 (12 months after the submission date); a supplier never assessed is due 30 days after it enters the cycle's scope.
- **US-24-6** As a compliance officer, every new supplier is screened against sanctions lists, and I review potential matches.
  - AC: Given the sanctions adapter returns a match with score ≥ the potential threshold for a new supplier, then a `potential_match` check and a pending match exist and a warning alert opens; when I confirm it with a note, the alert becomes critical and `watchlist.match_confirmed` is emitted; when I mark it a false positive, the alert is dismissed and the same provider record never alerts again for this supplier.
- **US-24-7** As a compliance officer, a failing screening provider does not fail silently.
  - AC: Given the adapter errors for three consecutive scheduled runs, then each check is stored with outcome `error`, retries follow backoff, and one info signal "Screening unavailable since …" is shown; no alert claims "clear".
- **US-24-8** As a procurement lead, the dashboard shows what needs attention now.
  - AC: Given open alerts, due reassessments and pending watchlist reviews, then `GET /companies/:cid/needs-attention` returns at most 8 items ordered by severity then age, each with a link, and the dashboard tile counts match the alerts tab.
- **US-24-9** As a user of another workspace, I can never see this workspace's signals, alerts, cycles or screening results.
  - AC: Given ids from workspace A, when a user of workspace B requests them, then the API answers 404.

## 6. Domain model

```ts
monitored_suppliers {                                      -- projection built from events (+ one-off backfill), never another module's table
  workspace_id, supplier_id uuid (M19, no FK), company_id → companies, name, country_code?, category_code?, tier?,
  risk_band: 'low'|'medium'|'high'|null, risk_residual int?, last_external_rating numeric?, status text, watchlist_enabled boolean default true,
  last_screened_at?, updated_at, primary key(workspace_id, supplier_id)
}
monitoring_rules {
  id, workspace_id, kind (§7.1), enabled boolean, severity_override?, params jsonb, updated_by → users, updated_at,
  unique(workspace_id, kind)                                -- absent row = engine defaults
}
monitoring_signals {                                       -- append-only
  id, workspace_id, company_id → companies?, supplier_id uuid?, kind, severity: 'info'|'warning'|'critical',
  source_type: 'certificate'|'cap'|'risk'|'finding'|'audit'|'questionnaire'|'grievance'|'external_rating'|'watchlist'|'reassessment'|'system',
  source_ref text?, title_key text, params jsonb, link text?, alert_id → monitoring_alerts?, event_id text unique?, occurred_at, created_at
}
monitoring_alerts {
  id, workspace_id, company_id → companies?, supplier_id uuid?, kind, dedupe_key text, severity, status: 'open'|'acknowledged'|'resolved'|'dismissed',
  title_key, params jsonb, link text?, assignee_user_id → users?, opened_at, last_signal_at, acknowledged_by → users?, acknowledged_at?,
  resolved_by → users? (null = resolved by source), resolved_at?, resolution_note?, unique(workspace_id, dedupe_key) where status in ('open','acknowledged')
}
reassessment_cycles {
  id, workspace_id, company_id → companies, name, kind: 'questionnaire'|'audit', template_ref text? (questionnaire template or checklist code),
  scope jsonb { riskBands?[], categoryCodes?[], countryCodes?[], tiers?[] }, intervals jsonb { low, medium, high, unrated } (months),
  lead_days smallint default 30, active boolean, created_by, created_at, updated_at
}
reassessment_items {
  id, workspace_id, cycle_id → reassessment_cycles, supplier_id uuid, entered_scope_on date, last_done_on date?, next_due_on date,
  status: 'upcoming'|'due'|'triggered'|'done'|'skipped'|'out_of_scope', triggered_at?, skipped_reason?, unique(cycle_id, supplier_id)
}
watchlist_checks  { id, workspace_id, supplier_id uuid, kind: 'sanctions'|'adverse_media', provider text, dataset_version text?, trigger: 'created'|'changed'|'scheduled'|'manual',
                    checked_at, outcome: 'clear'|'potential_match'|'error', match_count smallint, error_code? }
watchlist_matches { id, workspace_id, check_id → watchlist_checks, supplier_id uuid, kind, provider_ref text, list_name text?, matched_name text, score numeric(4,3),
                    summary text?, source_url text?, published_on date?, review_status: 'pending'|'confirmed'|'false_positive',
                    reviewed_by → users?, reviewed_at?, review_note?, unique(workspace_id, supplier_id, kind, provider_ref) }
```

- Every table: `workspace_id`, `ENABLE` + `FORCE ROW LEVEL SECURITY`, `app_current_workspace()` policy, isolation test. Foreign keys only to kernel tables and inside the module.
- `monitored_suppliers` is filled from `supplier.created|updated|archived` and `supplier.risk.changed`; when the module is first enabled for a workspace, a worker job backfills it through `supplier-register.listSuppliers` and `risk.riskOf` (exported queries).
- Text from external providers (`matched_name`, `summary`, `source_url`) is stored as plain text, length-capped, and never rendered as HTML.
- Indexes: `monitoring_signals(workspace_id, occurred_at desc)`, `monitoring_signals(workspace_id, supplier_id, occurred_at desc)`, `monitoring_alerts(workspace_id, status, severity)`, `reassessment_items(workspace_id, status, next_due_on)`.

## 7. Business rules & calculations

All rules are pure functions in `engine/` (no I/O); services feed them facts and persist the decisions.

### 7.1 Rule kinds and defaults (`engine/rules.ts`)

| Kind | Fact (event or job) | Signal severity (default) | Alert dedupe key | Auto-resolves on |
| --- | --- | --- | --- | --- |
| `certificate_expiring` | `certificate.expiring { documentId, certificateTypeCode, validUntil, threshold: 'd30' \| 'd7' }`, `certificate.expired` | `d30` warning · `d7` critical · expired critical | `cert:<documentId>` | `certificate.verified` for the same supplier and `certificateTypeCode` with a later `validUntil`, or `certificate.superseded` of that document |
| `cap_overdue` | `cap.overdue`, `cap.escalated { level }` | overdue warning · level 3 warning · level 4 critical | `cap:<capId>` | `cap.closed`, `cap.cancelled` |
| `risk_increase` | `supplier.risk.changed { band, previousBand, residual, previousResidual }` | `band` rises to `high` critical · other band rise warning · same band and `residual − previousResidual ≥ minDelta` (10) info | `risk:<supplierId>` | a later change to a band at or below the band before the alert opened |
| `finding_raised` | `finding.raised { severity }` | critical critical · major warning · minor/observation no signal | `finding:<findingId>` | `finding.closed`, `finding.withdrawn` |
| `audit_result` | `dd_audit.completed { result }` | `fail` critical · `pass_with_findings` warning · `pass` info | `audit:<auditId>` | — (manual) |
| `questionnaire_overdue` | `questionnaire.overdue { assignmentId, supplierId, dueAt }` | warning | `saq:<assignmentId>` | `questionnaire.submitted` with the same `assignmentId` |
| `reassessment_due` | daily cycle job (§7.2) | due info · `today > next_due_on` warning | `reassess:<itemId>` | item `done` or `skipped` |
| `watchlist_match` | screening job (§7.3) | potential warning · confirmed critical | `watch:<supplierId>:<kind>:<providerRef>` | review = false positive (dismissed) |
| `grievance` | `grievance.received` (company-level, no supplier) · `grievance.supplier_linked { supplierId, severity? }` · `grievance.overdue` | received info · linked to a supplier warning (critical when `severity` is `high` or `critical`, M25 §6) · overdue warning | `grievance:<caseId>` (linked/overdue) | — (manual) |
| `external_rating_drop` | `external_rating.updated { overall }` compared with the previous value kept in `monitored_suppliers.last_external_rating` | info when `previous − overall ≥ minDrop` (10 points); raise with `severity_override` to get alerts | `rating:<supplierId>` (only with an override) | a later rating back above the threshold |

- A rule produces at most one signal per fact (idempotent on the event id). Warning and critical signals open the alert of their dedupe key or update it; info signals never open an alert. An alert's history is every signal with its dedupe key, including earlier info signals.
- **Alert severity only goes up** while the alert is open; `alert.raised` is emitted when an alert opens and each time its severity increases. A resolved or dismissed alert is never reopened: the next matching fact opens a new alert.
- A disabled rule produces nothing; `severity_override` replaces the default severity of every signal of that kind.

### 7.2 Reassessment cycles (`engine/cycles.ts`)

- In scope ⇔ the supplier's projection matches every non-empty scope filter (risk band, category, country, tier) and its status is not archived. Leaving the scope sets the item `out_of_scope` (kept for history).
- `intervalMonths = intervals[risk_band ?? 'unrated']` (defaults: high 12, medium 24, low 36, unrated 12).
- `next_due_on = addMonths(last_done_on, intervalMonths)`; when never done: `entered_scope_on + lead_days`.
- Daily job: `upcoming → due` when `today ≥ next_due_on − lead_days` → emit `reassessment.due` once, status `triggered`. A risk-band change recomputes `next_due_on` from `last_done_on` (it can become due earlier, never moves an already triggered item).
- `done` when `questionnaire.submitted` (kind `questionnaire`, same `templateKey` when `template_ref` is set) or `dd_audit.completed` (kind `audit`, any non-legacy audit) arrives for the supplier after `triggered_at` or on/after `next_due_on − lead_days`; `last_done_on` = the submission/completion date, then a new `upcoming` row cycle continues.
- Month arithmetic clamps to the last day of the month (31 Jan + 1 month = 28/29 Feb).

### 7.3 Watchlist screening (`engine/watchlist.ts` + adapters)

- **When**: on `supplier.created`; on `supplier.updated` when legal name, aliases or country changed; scheduled (sanctions daily, adverse media weekly) for suppliers with `watchlist_enabled`; manually.
- **What is sent**: legal name, known aliases, country code and registration number when present — never personal data or buyer data (data minimisation).
- **Classification**: `score ≥ potentialThreshold` (default 0.80, rule param) → match stored `pending`; below → ignored. `outcome = 'potential_match'` when ≥ 1 new pending match, else `clear`. A provider record already reviewed for this supplier (`unique(…provider_ref)`) is never stored or alerted again, unless the provider reports it changed (new list, new date).
- **Only humans confirm**: `confirmed` or `false_positive` by `monitoring:manage` with a note (audited). Confirmed → alert critical + `watchlist.match_confirmed`.
- **Errors**: an adapter failure stores `outcome = 'error'`, retries with exponential backoff (BullMQ, max 5 attempts), and after 3 consecutive failed scheduled runs adds one `system` info signal; results never show "clear" for a failed run.
- **Adapters** (`src/infra/screening/`, planned, like `StorageAdapter`/`EmailAdapter`): `ScreeningAdapter.screen(subjects) → matches[]` with drivers `opensanctions` (self-hosted `yente` service or the hosted API, licence §13 Q1), `fake` (dev/tests, deterministic fixtures) and `none`; `AdverseMediaAdapter.search(subject, since) → articles[]` with drivers `fake`, `none` and a provider chosen in §13 Q2. Config via env (`SCREENING_DRIVER`, `ADVERSE_MEDIA_DRIVER`, keys as encrypted env vars). No AWS (ADR-011).

### 7.4 Needs attention (`engine/attention.ts`)

Union of open/acknowledged alerts, triggered reassessment items and pending watchlist matches, sorted by severity (critical → warning → info), then oldest first; limit 8 (max 20).

## 8. API contract (REST `/v1`)

| Route | Permission |
| --- | --- |
| `GET /companies/:cid/signals?cursor=&since=&severity=&source=&supplierId=` (newest first; `since` returns only newer signals, for polling) · `GET /suppliers/:sid/signals` | `monitoring:read` |
| `GET /companies/:cid/alerts?status=&severity=&kind=&assignee=&supplierId=&cursor=` · `GET /alerts/:id` (with its signals) | `monitoring:read` |
| `POST /alerts/:id/acknowledge` · `POST /alerts/:id/assign` `{ userId }` · `POST /alerts/:id/resolve` `{ note }` · `POST /alerts/:id/dismiss` `{ reason }` | `monitoring:triage` |
| `GET /companies/:cid/monitoring/summary` (tile counts) · `GET /companies/:cid/needs-attention?limit=` | `monitoring:read` |
| `GET /monitoring/rules` (all kinds with effective values) · `PATCH /monitoring/rules/:kind` `{ enabled?, severityOverride?, params? }` | `monitoring:read` / `monitoring:manage` |
| `GET/POST /companies/:cid/reassessment-cycles` · `PATCH/DELETE /reassessment-cycles/:id` · `GET /reassessment-cycles/:id/items?status=` | `monitoring:read` / `monitoring:manage` |
| `POST /reassessment-items/:id/trigger` · `POST /reassessment-items/:id/skip` `{ reason }` | `monitoring:manage` |
| `GET /companies/:cid/watchlist?review=&kind=&cursor=` · `GET /suppliers/:sid/watchlist` | `monitoring:read` |
| `POST /suppliers/:sid/watchlist:run` (job, `Idempotency-Key`) · `POST /watchlist-matches/:id/review` `{ decision: 'confirmed' \| 'false_positive', note }` · `PATCH /suppliers/:sid/watchlist` `{ enabled }` | `monitoring:manage` |

Alert responses include `allowedTransitions` for the caller. Errors: unknown rule kind 404; invalid transition of an alert (e.g. resolve a dismissed alert) 409 `invalid_state_transition`; reviewing an already reviewed match 409 `conflict`; adapter `none` configured → `watchlist:run` answers 503 `service_unavailable`.

## 9. UI

Nav entry **Monitoring** in the "Due diligence" group (`monitoring:read` + entitlement `due_diligence`; locked-module panel otherwise). Calm Ledger (02 §9): one entrance per view, nothing moves on its own; reduced motion = final values.

- **`/monitoring`** — screen pattern "Risk view" end (02 §9.5) as its own page: 4 `StatTile`s with `--motion-count` (open critical alerts, open alerts, reassessments due in 30 days, watchlist matches to review) → URL-synced tabs:
  - **Signals** (default) — the **signal feed** widget (02 §9.4): rows of time (relative, absolute in a tooltip), severity chip (icon + label in the §2.3 status colours, never colour alone), supplier link, one-line text (`t(title_key, params)`; params escaped), link to the source record. Filters: severity, source, supplier. Live updates by polling `since=` every 60s while the tab is visible (SSE from M12 later): new items fade in (180ms) at the top, `aria-live="polite"` announces the count, insertion pauses while hovered or focused and shows "N new signals — Show"; never auto-scrolls (WCAG 2.2.2); "Load older" at the end. Entrance: first 12 rows with `--motion-enter` (45ms stagger) on first render only.
  - **Alerts** — `DataTable` (severity, title, supplier, opened, last signal, assignee, status pill); row opens a `Sheet` with the alert's signal history (`Timeline`), source link and Acknowledge · Assign · Resolve (note) · Dismiss (reason) actions per permission.
  - **Reassessments** — cycles as cards (kind, scope chips, intervals per band, counts by status) + items table (supplier, risk band label + number, last done, next due, status); "New cycle" sheet (kind, template, scope, intervals, lead days); Trigger now / Skip (reason).
  - **Watchlist** — matches to review first, then recent checks; review dialog shows provider data as plain text (list name, matched name, score as %, published date, source link opening in a new tab with `rel="noopener noreferrer"`), Confirm / False positive with a required note; checks with `error` show "Not screened — provider unavailable".
  - **Rules** (only with `monitoring:manage`) — table of rule kinds with an enabled `Switch`, severity select and parameter inputs; saving shows a toast.
  - States: skeletons per tab (tiles, 10 feed rows, table rows); empty feed "No signals yet — signals appear when certificates near expiry, actions run late, risk changes or screening finds a match" + CTA "Set up a reassessment cycle"; error with retry per tab.
- **Supplier tab** `/suppliers/:sid/monitoring` (exported as `supplierMonitoringRoute`, composed by the router into M19 `supplierDetailRoute(extraTabs)`): the supplier's signal feed, open alerts and watchlist status ("Last screened …").
- No embeds for other features: the risk view (M22, wave 3) links to `/monitoring` (Signals tab) instead of mounting the feed, and the due diligence dashboard (dd-reporting) renders its "Needs attention" list from `AlertsQuery` data through its own API (M11 §4.5).
- No charts beyond `StatTile`s.

## 10. Events, notifications & audit

| Event (emitted) | Payload | Consumers |
| --- | --- | --- |
| `alert.raised` | `{ alertId, workspaceId, companyId?, supplierId?, kind, severity, sourceType, sourceRef?, raisedAt, escalated: boolean }` | dd-reporting (optional); notifications are sent by monitoring itself with `notify()` (critical immediately, others by preference/digest) |
| `alert.resolved` | `{ alertId, workspaceId, supplierId?, kind, by: 'user' \| 'source', resolvedAt }` | dd-reporting |
| `reassessment.due` | `{ itemId, cycleId, workspaceId, companyId, supplierId, kind: 'questionnaire' \| 'audit', templateRef?, dueOn }` | questionnaires (draft campaign for the supplier), dd-audits (planned audit) |
| `watchlist.match_confirmed` | `{ matchId, workspaceId, supplierId, kind: 'sanctions' \| 'adverse_media', listName?, confirmedAt }` | none in v1; later risk (aggravation factor, M22 §13) and supplier-register (high-concern flag, §13 Q4) |

Consumes (each → rule evaluation §7.1 unless noted): `certificate.expiring`, `certificate.expired`, `certificate.verified`, `certificate.superseded` (supplier-evidence) · `cap.overdue`, `cap.escalated`, `cap.closed`, `cap.cancelled` (corrective-actions) · `supplier.risk.changed` (risk; also updates the projection and cycle due dates) · `finding.raised`, `finding.withdrawn`, `finding.closed`, `dd_audit.completed` (dd-audits; completion also marks audit reassessments done) · `questionnaire.overdue`, `questionnaire.submitted` (questionnaires; submission also marks questionnaire reassessments done) · `grievance.received`, `grievance.supplier_linked`, `grievance.overdue` (grievances) · `external_rating.updated` (esg-data) · `supplier.created`, `supplier.updated`, `supplier.archived` (supplier-register: projection, watchlist triggers, items out of scope).

Notifications (M12 category `dd_alerts`): critical alert opened/escalated → in-app + email to `monitoring:manage` holders and the assignee; assignment → assignee; others only in-app and the daily digest. Audit entries: rule changes, cycle changes, alert triage actions, match reviews, manual screening runs.

## 11. Migration from legacy

None: legacy has no monitoring data. After migration of suppliers (M19) and certificates (M14), the backfill job builds `monitored_suppliers`, and the first scheduled runs create signals for already expiring certificates and the initial watchlist checks (throttled per workspace so a large import does not flood the feed: initial screening results are grouped into one signal per workspace "Initial screening of N suppliers done, M to review").

## 12. Test plan

- Engine: `rules.spec.ts` table-driven per kind (severity boundaries 30/8/7 days, band changes, `minDelta`, disabled rule, override, idempotency by event id, severity only rises), `cycles.spec.ts` (intervals per band, unrated, never assessed, month-end clamping, band change before/after trigger, out of scope), `watchlist.spec.ts` (threshold, reviewed provider refs suppressed, changed record re-alerts), `attention.spec.ts` (ordering, limit); property tests `rules.property.spec.ts` (severity monotonic per alert, one signal per fact) and `cycles.property.spec.ts` (next due always after last done, never before entering scope).
- E2e (fake adapters, fixed clock): `test/monitoring-signals.e2e-spec.ts` (US-24-1, 3, 4, 9), `test/monitoring-cycles.e2e-spec.ts` (US-24-5), `test/monitoring-watchlist.e2e-spec.ts` (US-24-6, 7), `test/monitoring-attention.e2e-spec.ts` (US-24-8); extend `route-authorization`, `route-access-matrix`, `tenancy-rls`.
- Frontend: signal feed component test (insertion, pause on hover/focus, live region text, reduced motion), triage sheet keyboard flow, Playwright journey "open alert → assign → resolve" with axe.

## 13. Open questions

1. **Sanctions data licence** — OpenSanctions data is free for non-commercial use only; commercial SaaS use needs a data licence (or a commercial provider). Recommended: OpenSanctions commercial licence with a self-hosted `yente` container on the VPS (no per-call cost, no data leaves our servers), behind `ScreeningAdapter`; owner to approve the cost.
2. **Adverse-media provider** — no free source of acceptable quality. Recommended: ship the adapter with `none` and `fake` drivers, keep the feature off by default, and decide the provider together with the CSRhub licence (SD16) since both are paid external data.
3. **Screening individuals** (directors, beneficial owners) — personal data, GDPR Art. 10 concerns. Recommended: out of scope for v1; companies only.
4. **Should a confirmed sanctions match change the supplier status** automatically (e.g. high concern)? Recommended: no automatic status change; `watchlist.match_confirmed` lets supplier-register set the high-concern flag and risk add a factor, the suspension decision stays human (as for CAPs).
5. **Live transport** — polling every 60s vs M12 SSE. Recommended: polling in v1 (no dependency on the notification stream), switch to SSE when M12 §2.2 ships; the UI behaviour is identical.

## 14. Module contract

Filled by `/module-contract` (`06-modular-build.md` §2.1, §3). Folder: `src/modules/monitoring/` · `src/features/monitoring/` · Wave: 4

| | |
| --- | --- |
| Owns | Tables `monitored_suppliers`, `monitoring_rules`, `monitoring_signals`, `monitoring_alerts`, `reassessment_cycles`, `reassessment_items`, `watchlist_checks`, `watchlist_matches` (RLS). Routes `/v1/companies/:cid/{signals,alerts,monitoring/summary,needs-attention,reassessment-cycles,watchlist}`, `/v1/suppliers/:sid/{signals,watchlist,watchlist:run}`, `/v1/alerts/*`, `/v1/monitoring/rules*`, `/v1/reassessment-cycles/*`, `/v1/reassessment-items/*`, `/v1/watchlist-matches/*`. Permissions `monitoring:read`, `monitoring:triage`, `monitoring:manage` (entitlement `due_diligence`). Adapters `ScreeningAdapter`, `AdverseMediaAdapter` (`src/infra/screening/`). i18n namespace `monitoring`. FE routes `/monitoring`, `/suppliers/:sid/monitoring` |
| Public surface (`index.ts`) | `MonitoringModule` (app.module, worker.ts) · `MonitoringEvents` (event name constants: questionnaires and dd-audits consume `reassessment.due`; dd-reporting optional) · `AlertsQuery.openAlertsFor(workspaceId, { companyId?, supplierId? })` → `AlertReadModel[]` and `AlertsQuery.summary(workspaceId, companyId)` → `AlertSummary` and `AlertsQuery.needsAttention(workspaceId, companyId, limit)` → `AttentionItem[]` (dd-reporting dashboard) · types `AlertReadModel`, `AlertSummary`, `AlertSeverity` · FE: `monitoringRoutes`, `supplierMonitoringRoute` (tab child for M19 `supplierDetailRoute(extraTabs)`, `handle.tab`) |
| Depends on | `supplier-register` `listSuppliers` / `getSupplier` (projection backfill, link targets) — fake `__tests__/fakes/supplier-register.fake.ts` · `risk` `riskOf` (backfill of bands) — `risk.fake.ts` · `notifications` `notify()`, `EventBus.publish` + `OnDomainEvent` — `notifications.fake.ts` · `audit` `AuditService`. Every other DD module is reached **only through its events** (no imports); tests publish fixture events |
| Emits | `alert.raised`, `alert.resolved`, `reassessment.due`, `watchlist.match_confirmed` (payloads §10) |
| Consumes | `certificate.expiring`, `certificate.expired`, `certificate.verified`, `certificate.superseded`, `cap.overdue`, `cap.escalated`, `cap.closed`, `cap.cancelled`, `supplier.risk.changed`, `finding.raised`, `finding.withdrawn`, `finding.closed`, `dd_audit.completed`, `questionnaire.overdue`, `questionnaire.submitted`, `grievance.received`, `grievance.supplier_linked`, `grievance.overdue`, `external_rating.updated`, `supplier.created`, `supplier.updated`, `supplier.archived` → rules §7.1, cycles §7.2, projection |
