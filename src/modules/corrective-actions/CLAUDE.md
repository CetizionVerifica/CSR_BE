# Corrective actions (M09 §14.1 · SD09)

> Spec: `docs/revamp/modules/M09-actions-kpis.md` (§4.3, §7.1, §14.1 — `origin='supplier'`) · Status: Draft · Wave: 3

## Purpose

Supplier corrective action plans (CAPs): non-conformities found by audits (`finding.raised`), substantiated grievances or by hand become a plan of required actions with due dates; the buyer issues it, the supplier responds and reports progress (in-app if linked, otherwise by token link), the buyer verifies each action and closes the plan; overdue actions escalate up to a suspension recommendation that a human decides. Actions use the M09 action shape with `origin = 'supplier'` in this module's own tables.

## Owns

- Tables (`workspace_id` = buyer, RLS `ENABLE` + `FORCE`, migration `<ts>_rls_corrective_actions_tables`, planned): `cap_plans`, `cap_actions`, `cap_responses`, `cap_events`, `cap_response_links`, `cap_supplier_links` (projection of `supplier.linked`/`unlinked`), `cap_policies` (M09 §6). `cap_plans`, `cap_actions`, `cap_responses` get a second **read-only** policy `supplier_workspace_id = app_current_workspace()` for the linked supplier. FKs only to `workspaces`, `companies`, `users`, `files` and inside the module.
- Routes (M09 §8): `/v1/companies/:cid/caps`, `/v1/caps/*`, `/v1/cap-actions/*`, `/v1/suppliers/:sid/caps`, `/v1/workspaces/current/cap-policy`, supplier side `/v1/customer-caps*`, `/v1/customer-cap-actions/*`, public `/v1/public/caps/:token*`.
- Permissions (new, add to `identity/engine/permissions.ts` and the `Permission` union): `cap:read` (owner, admin, partner_admin, contributor, viewer, auditor), `cap:manage` and `cap:verify` (owner, admin, partner_admin) — all three mapped to `due_diligence` in `PERMISSION_MODULE`; `cap:respond` (owner, admin, contributor; **no** module mapping, supplier workspaces need no DD licence).
- BullMQ: repeatable job `cap-escalation-scan` (hourly) registered in `src/worker.ts`.
- Events/audit actions: `CapEvents` in `events.ts` (planned).

## Public surface (`index.ts`)

| Export (all planned)                                                                                                | Why others need it                                                                                |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `CorrectiveActionsModule`                                                                                           | `app.module.ts`, `worker.ts`                                                                      |
| `CapEvents`                                                                                                         | Constants for monitoring, risk, dd-audits, supplier-register (suspension), grievances subscribers |
| `CapQuery.capStatusFor(workspaceId, supplierId)` → `SupplierCapStatus { open, overdue, maxLevel, suspensionState }` | risk backfill, screening, dd-reporting, dashboard tile "open corrective actions"                  |
| `CapQuery.listSupplierActions(workspaceId, companyId)` → `ActionReadModel[]` (M09 action shape)                     | future M09 performance board shows supplier actions without sharing a table                       |
| types `SupplierCapStatus`, `ActionReadModel`, `CapStatus`                                                           | Read-model types                                                                                  |

## Depends on

- `supplier-register`: `getSupplier` (name, buyer company), `primaryContact` (default contact email) — fake `__tests__/fakes/supplier-register.fake.ts`. `supplier_workspace_id` comes from the `supplier.linked` event (M20 payload `supplierWorkspaceId`), not from a portal import.
- `files` (M14): upload intent incl. token-scoped purpose `cap_evidence`, file read model (`ready` check) — fake `files.fake.ts`.
- `notifications` (M12 §14): `EventBus.publish`, `@OnDomainEvent`, `notify()` (members), `sendEmail()` (token link to the supplier contact) — fake `__tests__/fakes/notifications.fake.ts`.
- `identity` `decidePermission`, `audit` `AuditService` (real).
- **Not** `dd-audits` (wave 4): findings arrive only as events; the finding snapshot is stored on the action. Tests publish fixture `finding.raised` events.

## Events

- Emits (payloads M09 §10): `cap.issued`, `cap.overdue`, `cap.escalated`, `cap.suspension_decided`, `cap.closed` (with `findingIds`), `cap.cancelled`.
- Consumes: `finding.raised` → action on the draft CAP of (audit, supplier), severity `observation` ignored, idempotent on finding id · `finding.withdrawn` → cancel the action · `grievance.substantiated` → draft CAP per supplier (`source_type='grievance'`) · `supplier.linked` / `supplier.unlinked` → `cap_supplier_links` + set/clear `supplier_workspace_id` on open plans · `supplier.archived` → cancel drafts.

## Components & behaviour

- `caps.controller.ts`, `cap-actions.controller.ts`, `customer-caps.controller.ts` (planned) — `@Can('cap:*')`; customer routes run in the supplier's own workspace and see only rows whose `supplier_workspace_id` matches (RLS read policy).
- `public-caps.controller.ts` (planned) — `@Public()`, rate-limited; token (256-bit, hashed) scopes to one plan; expires 30 days after close/cancel; revoked by reissue.
- `caps.service.ts` (planned) — create/edit drafts, `issue` (resolves due dates via `engine/due-dates.ts`, forces `response_required` for major/critical, creates the link, emits `cap.issued`), response accept / request changes (round + 1), `close` (all non-cancelled actions verified), `cancel`, suspension decision (`cap.suspension_decided`, never automatic). Every transition through `engine/cap-state.ts`.
- `cap-actions.service.ts` (planned) — supplier submit (`done` needs note + `ready` evidence when required → `verification = pending`; plan auto-moves to `pending_verification`), buyer verify/reject (comment), due-date extension with reason (`due_extended` row, level recomputed).
- `escalation.processor.ts` (planned) — hourly scan per workspace: `engine/escalation.ts` decides the level per open action; inserts a `cap_events` row per (action, kind, level) — the unique key makes reruns no-ops — then notifies and emits `cap.overdue` / `cap.escalated`. `today` in the workspace time zone; tests use a fixed clock.
- `findings.handler.ts`, `grievances.handler.ts`, `links.handler.ts` (planned) — event consumers above.
- `engine/` (planned, pure, table + property tests): `cap-state.ts`, `due-dates.ts` (critical 30 / major 60 / minor 90 days, policy override), `escalation.ts` (ladder M09 §7.1: reminder −7, overdue +1, escalated +14, suspension recommended +30 or +7 for critical; pending verification pauses; monotonic; plan level = max).

## Invariants

- A buyer of another workspace gets 404 for every CAP id; a supplier workspace sees only plans addressed to it; a token never reveals another plan. RLS tests cover both policies.
- Supplier-side writes touch only response and action-progress fields; every supplier-side read is audited (M12).
- Escalation steps happen once per action and level; suspension only by a human decision with a reason.
- `cap.closed` names every finding id of the plan's non-cancelled actions.

## Tests

- Engine: `engine/cap-state.spec.ts`, `due-dates.spec.ts`, `escalation.spec.ts`, `escalation.property.spec.ts`.
- E2e: `test/corrective-actions-lifecycle.e2e-spec.ts` (US-09-5, 6, 7, 9), `test/corrective-actions-escalation.e2e-spec.ts` (US-09-8), `test/corrective-actions-supplier-access.e2e-spec.ts` (US-09-10). Extend `route-authorization`, `route-access-matrix`, `tenancy-rls`. Add the module (stories US-09-5…10) to `spec-coverage.json`.

## Not here

Findings and audits (`dd-audits`), the alert feed (`monitoring` turns `cap.*` into alerts), supplier status and suspension flag (`supplier-register` applies `cap.suspension_decided`), company actions/KPIs/targets (M09 performance module), grievance case handling (`grievances`).
