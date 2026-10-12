# Supplier audits (M23 · SD08)

> Spec: `docs/revamp/modules/M23-dd-audits.md` · Status: Draft · Wave: 4

## Purpose

Buyers plan and run desk reviews and on-site/remote audits of their suppliers: scheduling with a supplier-confirmed visit date, a checklist snapshotted from the reference-data template library, assigned auditors, findings with severity, a four-eyes approval and a computed result. Findings start corrective action plans (`corrective-actions`) and feed residual risk (`risk`) only through events. Also holds the migrated legacy "physical audit" flag as completed audit records.

## Owns

- Tables (all `workspace_id` = buyer, `ENABLE` + `FORCE` RLS with `app_current_workspace()`, migration `<ts>_rls_dd_audits_tables`, planned): `dd_audits`, `dd_audit_assignments`, `dd_audit_items`, `dd_findings`, `dd_audit_visit_links` (M23 §6). FKs only to `workspaces`, `companies`, `users`, `files` and inside the module; `supplier_id`/`site_id` are plain uuids checked through `supplier-register`.
- Routes (M23 §8): `/v1/companies/:cid/dd-audits`, `/v1/companies/:cid/dd-audits:record-external`, `/v1/dd-audits/*`, `/v1/dd-findings/*`, `/v1/companies/:cid/dd-findings`, `/v1/suppliers/:sid/dd-audits`, public `/v1/public/audit-visits/:token*`.
- Permissions (new, add to `identity/engine/permissions.ts`, the `Permission` union and `PERMISSION_MODULE` → `due_diligence`): `dd_audit:read` (owner, admin, partner_admin, contributor, viewer, auditor), `dd_audit:conduct` (owner, admin, partner_admin, auditor — narrowed to assigned audits by the service), `dd_audit:manage` (owner, admin, partner_admin).
- Problem types (add to `PROBLEM_TYPES`): `checklist_incomplete` (409, extension `itemCodes`), `auditor_not_eligible` (409).
- Events/audit actions: `DdAuditEvents` in `events.ts` (planned).
- BullMQ: no queue of its own; notifications go through `notify()`.

## Public surface (`index.ts`)

| Export (all planned)                                                                                   | Why others need it                                                                                |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `DdAuditsModule`                                                                                       | Registered in `app.module.ts` and `worker.ts` (event handlers)                                    |
| `DdAuditEvents`                                                                                        | Event name constants for risk, monitoring, corrective-actions, dd-reporting subscribers           |
| `FindingsQuery.getFinding(workspaceId, id)` / `listFindings(workspaceId, filter)` → `FindingReadModel` | dd-reporting, monitoring drill-down. Not used by corrective-actions (it keeps the event snapshot) |
| `AuditsQuery.latestAuditFor(workspaceId, supplierId)` → `AuditSummary \| null`                         | risk backfill, screening columns, dd-reporting                                                    |
| types `FindingReadModel`, `AuditSummary`, `FindingSeverity`, `AuditResult`                             | Read-model types, never Prisma rows                                                               |

Missing or other-workspace ids return `null`, never throw.

## Depends on

- `supplier-register`: `SupplierRegisterService.getSupplier`, `listSites`, `primaryContact` (existence, site, visit email) — fake `__tests__/fakes/supplier-register.fake.ts`.
- `reference-data` (M13): checklist template by code + version and finding categories (lookup by code) — fake `__tests__/fakes/reference-data.fake.ts`. Request this export in the M13 contract if it is missing.
- `files` (M14): file read model (`status = ready`, purpose `audit_evidence` / `audit_report`) — fake `files.fake.ts`.
- `notifications` (M12 §14): `EventBus.publish`, `@OnDomainEvent`, `notify()` (members) and `sendEmail()` (visit link to the supplier contact) — fake `__tests__/fakes/notifications.fake.ts`.
- `identity`: `decidePermission` (assignee eligibility); `audit`: `AuditService.record` (real).

## Events

- Emits (payloads M23 §10): `dd_audit.scheduled`, `dd_audit.completed`, `dd_audit.cancelled`, `finding.raised`, `finding.withdrawn`, `finding.closed`.
- Consumes: `cap.closed { capId, findingIds }` → findings `closed` + `finding.closed` · `reassessment.due { kind: 'audit' }` (monitoring) → `planned` audit, `source='cycle'`, `source_ref = itemId` · `supplier.archived` → cancel planned/scheduled audits. All handlers idempotent.

## Components & behaviour

- `dd-audits.controller.ts`, `dd-findings.controller.ts` (planned) — HTTP only, `@Can('dd_audit:*')`, Zod DTOs in `dto/`, cursor pagination, every status documented (400, 403, 404, 409).
- `public-visits.controller.ts` (planned) — `@Public()`, rate-limited per IP and token; token resolved by a narrow `SECURITY DEFINER` lookup (M08 public-survey pattern), then `withTenant`. Answers 400 `invalid_token` for expired/used/unknown tokens (no enumeration).
- `audits.service.ts` (planned) — transitions through `engine/audit-state.ts` only (M23 §7.1): schedule snapshots the template into `dd_audit_items` and issues the visit link (256-bit token, hashed, expiry `planned_end + 1 day`, one active link); submit checks completeness (`checklist_incomplete`); approve enforces approver ≠ lead, runs `engine/audit-result.ts`, raises draft findings, emits `finding.raised` per finding then `dd_audit.completed`, all in one `withTenant` transaction with audit entries (events published after commit). `recordExternal` creates a `completed` audit with `source='external'`.
- `assignments.service.ts` (planned) — replaces the team; every user must pass `decidePermission('dd_audit:conduct')` in this workspace else 409 `auditor_not_eligible`; returns `auditorOverlap` warnings from `engine/schedule.ts`.
- `checklist.service.ts` (planned) — answer an item (assignee only, `in_progress` only); an NC answer drafts a finding with the default severity if none is linked.
- `findings.service.ts` (planned) — draft edit (severity never below the item's default), `raise` (critical only, before approval), `withdraw` (manager, reason), ref `F-<year>-<seq>` from a per-workspace sequence.
- `*.repository.ts` (planned) — the only Prisma access, every query in `prisma.withTenant`.
- `engine/` (planned, pure): `audit-state.ts` (allowed transitions + guards), `audit-result.ts` (conformance %, `pass | pass_with_findings | fail`, finding summary; M23 §7.4), `schedule.ts` (overlap, link expiry), `finding-severity.ts` (answer → default severity, floor rule).

## Invariants

- Another workspace's ids answer 404 on every route, including visit tokens; RLS cases for all five tables in `test/tenancy-rls.e2e-spec.ts`.
- Completed audits and their items are immutable; template edits never change a scheduled audit (snapshot).
- `finding.raised` is emitted exactly once per finding; findings close only from `cap.closed`.
- Conformance and result are computed only by `engine/audit-result.ts`, never accepted from a client.
- Non-assignees cannot write items or findings even with `dd_audit:conduct`.

## Tests

- Engine: `engine/audit-result.spec.ts`, `audit-result.property.spec.ts`, `audit-state.spec.ts`, `schedule.spec.ts`.
- E2e: `test/dd-audits-lifecycle.e2e-spec.ts` (US-23-1, 3, 4, 5, 6), `test/dd-audits-public.e2e-spec.ts` (US-23-2), `test/dd-audits-findings.e2e-spec.ts` (US-23-8), `test/dd-audits-tenancy.e2e-spec.ts` (US-23-9), migration fixture (US-23-7). Extend `route-authorization`, `route-access-matrix`, `tenancy-rls`. Add `dd-audits` to `spec-coverage.json`.

## Not here

Corrective action plans (`corrective-actions`), reassessment schedules and alerts (`monitoring`), risk scores (`risk`), supplier certificates and third-party audit reports as evidence (`supplier-evidence`), checklist template authoring (`reference-data`), audit PDF rendering (`dd-reporting`), the M12 audit trail (`audit` — a different thing).
