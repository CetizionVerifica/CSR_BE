# Monitoring & alerts (M24 · SD10)

> Spec: `docs/revamp/modules/M24-monitoring.md` · Status: Draft · Wave: 4

## Purpose

Continuous due diligence: turns facts published by the other DD modules (expiring certificates, overdue CAPs, risk changes, critical findings, overdue questionnaires, grievances, rating drops) and its own sanctions / adverse-media screening into a signal feed and deduplicated alerts for triage, and runs reassessment cycles that emit `reassessment.due` so questionnaires and audits are repeated on time. Feeds the dashboard "Needs attention" list.

## Owns

- Tables (`workspace_id`, RLS `ENABLE` + `FORCE`, migration `<ts>_rls_monitoring_tables`, planned): `monitored_suppliers` (projection from events), `monitoring_rules`, `monitoring_signals` (append-only), `monitoring_alerts`, `reassessment_cycles`, `reassessment_items`, `watchlist_checks`, `watchlist_matches` (M24 §6). FKs only to `workspaces`, `companies`, `users` and inside the module.
- Routes (M24 §8): `/v1/companies/:cid/{signals,alerts,monitoring/summary,needs-attention,reassessment-cycles,watchlist}`, `/v1/suppliers/:sid/{signals,watchlist,watchlist:run}`, `/v1/alerts/*`, `/v1/monitoring/rules*`, `/v1/reassessment-cycles/*`, `/v1/reassessment-items/*`, `/v1/watchlist-matches/*`.
- Permissions (new, add to `identity/engine/permissions.ts`, `Permission` union, `PERMISSION_MODULE` → `due_diligence`): `monitoring:read` (owner, admin, partner_admin, contributor, viewer, auditor), `monitoring:triage` (owner, admin, partner_admin, contributor), `monitoring:manage` (owner, admin, partner_admin).
- Adapters (kernel infra, planned): `src/infra/screening/` — `ScreeningAdapter` (drivers `opensanctions`, `fake`, `none`) and `AdverseMediaAdapter` (`fake`, `none`, provider TBD M24 §13 Q2); env `SCREENING_DRIVER`, `ADVERSE_MEDIA_DRIVER` validated in `src/config`. No AWS.
- BullMQ (registered in `src/worker.ts`): `monitoring-events` (event handlers), `reassessment-scan` (daily), `watchlist-screen` (on demand + daily sanctions / weekly adverse media, backoff, max 5 attempts), `monitoring-backfill` (once per workspace).
- Events/audit actions: `MonitoringEvents` in `events.ts` (planned).

## Public surface (`index.ts`)

| Export (all planned)                                                                       | Why others need it                                                                     |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `MonitoringModule`                                                                         | `app.module.ts`, `worker.ts`                                                           |
| `MonitoringEvents`                                                                         | Constants for questionnaires and dd-audits (`reassessment.due`); dd-reporting optional |
| `AlertsQuery.openAlertsFor(workspaceId, { companyId?, supplierId? })` → `AlertReadModel[]` | dd-reporting (alert sections), supplier summaries                                      |
| `AlertsQuery.summary(workspaceId, companyId)` → `AlertSummary`                             | dd-reporting dashboard tiles                                                           |
| `AlertsQuery.needsAttention(workspaceId, companyId, limit)` → `AttentionItem[]`            | dd-reporting dashboard "Needs attention" (same rule as `GET …/needs-attention`)        |
| types `AlertReadModel`, `AlertSummary`, `AlertSeverity`                                    | Read-model types                                                                       |

## Depends on

- `supplier-register`: `listSuppliers`, `getSupplier` (backfill, names for signals) — fake `__tests__/fakes/supplier-register.fake.ts`.
- `risk`: `RiskQueries.risksFor` (band backfill) — fake `risk.fake.ts`.
- `notifications` (M12 §14): `EventBus.publish`, `@OnDomainEvent`, `notify()` (category `dd_alerts`) — fake `__tests__/fakes/notifications.fake.ts`.
- `audit` `AuditService` (real). Every other DD module only through events (no imports); tests publish fixture events with the payloads of their specs' §10.

## Events

- Emits (payloads M24 §10): `alert.raised` (open + each severity increase), `alert.resolved`, `reassessment.due`, `watchlist.match_confirmed`.
- Consumes: `certificate.expiring|expired|verified|superseded`, `cap.overdue|escalated|closed|cancelled`, `supplier.risk.changed`, `finding.raised|withdrawn|closed`, `dd_audit.completed`, `questionnaire.overdue|submitted`, `grievance.received|supplier_linked|overdue`, `external_rating.updated`, `supplier.created|updated|archived` → rules (M24 §7.1), cycles (§7.2), projection, watchlist triggers. Idempotent on the event id (`monitoring_signals.event_id` unique).

## Components & behaviour

- `signals.controller.ts`, `alerts.controller.ts`, `cycles.controller.ts`, `watchlist.controller.ts`, `rules.controller.ts` (planned) — `@Can('monitoring:*')`; signals list supports `since=` for polling and cursor for older pages.
- `signals.service.ts` (planned) — runs `engine/rules.ts` for each fact with the workspace's effective rules, appends the signal, opens/updates the alert of the dedupe key (severity only rises; resolved/dismissed never reopen), emits `alert.raised`, notifies critical alerts immediately.
- `alerts.service.ts` (planned) — acknowledge, assign (member check), resolve (note), dismiss (reason) through `engine/alert-state.ts`; auto-resolve on source facts with `resolved_by = null`.
- `cycles.service.ts` + `reassessment.processor.ts` (planned) — CRUD of cycles; daily scan computes scope and due dates with `engine/cycles.ts`, marks `due`, emits `reassessment.due` once, closes items on `questionnaire.submitted` / `dd_audit.completed`.
- `watchlist.service.ts` + `watchlist.processor.ts` (planned) — sends only legal name, aliases, country, registration no.; `engine/watchlist.ts` classifies against the threshold (0.80) and suppresses reviewed provider refs; review confirm/false positive (`monitoring:manage`, note, audited); errors stored, one `system` signal after 3 failed scheduled runs. Provider text stored as length-capped plain text.
- `projection.handler.ts` (planned) — maintains `monitored_suppliers` from supplier and risk events; `monitoring-backfill` fills it on first enable.
- `engine/` (planned, pure): `rules.ts` (rule kinds, defaults, severity, dedupe keys, auto-resolve), `alert-state.ts`, `cycles.ts` (intervals by band, month-end clamp), `watchlist.ts`, `attention.ts` (needs-attention order, limit 8). Formulas in M24 §7.

## Invariants

- Another workspace's ids answer 404; RLS cases for all eight tables.
- One signal per fact; alert severity never decreases while open; a resolved alert is never reopened.
- No automatic supplier status change from a watchlist match; only humans confirm matches.
- A failed screening run is never shown as "clear".
- Monitoring never reads another module's tables; its projection is built only from events and exported queries.

## Tests

- Engine: `engine/rules.spec.ts`, `rules.property.spec.ts`, `cycles.spec.ts`, `cycles.property.spec.ts`, `watchlist.spec.ts`, `attention.spec.ts`.
- E2e (fake adapters, fixed clock): `test/monitoring-signals.e2e-spec.ts` (US-24-1, 3, 4, 9), `test/monitoring-cycles.e2e-spec.ts` (US-24-5), `test/monitoring-watchlist.e2e-spec.ts` (US-24-6, 7), `test/monitoring-attention.e2e-spec.ts` (US-24-8). Extend shared suites; add to `spec-coverage.json` (US-24-2 is FE-only: waiver "covered by the FE signal feed test").

## Not here

Risk computation (`risk`), certificate expiry scan and supplier reminders (`supplier-evidence`), CAP escalation ladder (`corrective-actions`), creating questionnaire campaigns or audits (`questionnaires`, `dd-audits` react to `reassessment.due`), supplier ranking (`screening` — SD07, unrelated to watchlist screening), email delivery and digests (`notifications`).
