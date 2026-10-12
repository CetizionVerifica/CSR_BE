# Grievances (M25 · SD11)

> Spec: `docs/revamp/modules/M25-grievances.md` · Status: Draft · Wave: 2

## Purpose

The LkSG §8 / CSDDD complaints procedure: a public, accessible intake form (anonymous by default) for workers and communities, and a confidential case workflow for appointed handlers, linked to suppliers, with deadlines, retention and anonymised statistics for reporting. Everything here is planned; nothing is built yet.

## Owns

- Tables (all `workspace_id`, RLS `ENABLE` + `FORCE`, migration `prisma/migrations/*_grievances`): `grievance_channels`, `grievance_handlers`, `grievance_cases`, `grievance_messages`, `grievance_supplier_links`, `grievance_measures`, `grievance_conflicts`. Columns: M25 §6. FKs only to `companies`, `users`, `files`; `supplier_id`, `site_id`, `corrective_action_ref` are plain uuids. `*_enc` columns are AES-256-GCM (`grievance-crypto.ts`).
- Routes (M25 §8), all `/v1`:

| Routes                                                                                                     | Guard                                                                                                |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `/grievance-channels*`, `/grievance-handlers*`, `POST /grievances/:id/legal-hold`                          | `@Can('grievance:configure')`                                                                        |
| `/grievances*` (list, detail, triage, transition, messages, suppliers, measures, conflicts, manual intake) | `@Can('grievance:handle')` + appointment check in the service (`404` if not appointed or conflicted) |
| `/grievance-stats*`, `GET /suppliers/:sid/grievance-summary`                                               | `@Can('grievance:stats')` (export also `dd_report:export`)                                           |
| `/public/grievances/*`                                                                                     | `@Public()` + `RateLimiter` (M25 §7.3), no cookies                                                   |

- Permissions to add to the M01 matrix: `grievance:configure` (owner, admin, platform_owner for config only), `grievance:handle` (owner, admin, contributor — effective only with a `grievance_handlers` row), `grievance:stats` (owner, admin, auditor). Entitlement `due_diligence`. `platform:*` never grants case content.
- Env (planned, `src/config` + `.env.example`): `GRIEVANCE_MASTER_KEY`, `GRIEVANCE_FORM_HMAC_KEY`.
- Queue: `grievances` (planned constant in `src/infra/queue/queues.ts`).

## Public surface (`index.ts`)

| Export (planned)                                                                        | Why                                                |
| --------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `GrievancesModule`                                                                      | `app.module.ts` / `worker.ts`                      |
| `GrievanceEvents`                                                                       | monitoring, corrective-actions consume             |
| `GrievanceStatsQuery.forPeriod(wid, from, to)` → `GrievanceStats`                       | dd-reporting (LkSG annual report, CSDDD statement) |
| `GrievanceSummaryQuery.bySupplier(wid, sid)` → `SupplierGrievanceSummary` (counts only) | dd-reporting supplier profile                      |

Nothing content-bearing is exported.

## Depends on

| Module              | Uses                                                                                                                   | Fake (`__tests__/fakes/`)      |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `identity`          | `hashToken`, `decidePermission`                                                                                        | real (built)                   |
| `workspaces`        | company read model, `due_diligence` entitlement (planned exports)                                                      | real (built)                   |
| `audit`             | `AuditService.record` (ids only, never content)                                                                        | real (built)                   |
| `reference-data`    | grievance category list by code, countries                                                                             | `fake-reference-categories.ts` |
| `files`             | upload intent (purpose `grievance_attachment`), scan status, delete on purge                                           | `fake-files.ts`                |
| `notifications`     | `notify()` (content-free templates), `sendEmail()` (reporter address, if given), `EventBus.publish` + `@OnDomainEvent` | `fake-notifications.ts`        |
| `supplier-register` | `getSupplier` (exists in workspace, name, tier, status)                                                                | `fake-supplier-register.ts`    |

Infra: `RateLimiter`, Redis (form-token nonces, 2 h TTL).

## Events

- Emits: `grievance.received`, `grievance.supplier_linked`, `grievance.status_changed`, `grievance.substantiated`, `grievance.overdue` (payloads M25 §10, never reporter data or free text).
- Consumes: `supplier.archived` → flag link; `file.scanned` → hide quarantined attachments; `cap.closed` → mark matching measure done.

## Components & behaviour

- `public-intake.controller.ts` + `intake.service.ts` — form token (HMAC, 4 s–2 h, single-use nonce), honeypot, rate limits, Zod validation with size caps, encrypt then insert, reference `GRV-<year>-<6 digits>` (per-workspace sequence), access code (16 random bytes, SHA-256 stored), duplicate hash flag; generic errors that reveal nothing.
- `follow-up.service.ts` — reference + code → opaque 30-min follow-up token (Redis), lockout after 5 failures / 15 min; coarse status mapping (M25 §7.1); reporter messages and withdrawal.
- `cases.service.ts` — triage, assignment, transitions via `engine/case-state.ts` (`409` otherwise), required reporter-visible messages, supplier links through `getSupplier`, measures, conflicts, legal hold; writes `grievance.viewed` audit on every detail read.
- `handlers.service.ts` — appoint/revoke; a case read requires role permission **and** active appointment **and** no conflict row.
- `stats.service.ts` — `engine/stats.ts` aggregates with suppression of counts 1–2.
- `grievance-crypto.ts` — per-workspace data key wrapped by the master key; the only place that decrypts.
- `engine/` (pure): `case-state.ts`, `deadlines.ts` (ack 7 d, feedback 90 d after ack, due-soon 2 d, channel time zone), `stats.ts`.
- Processors: `grievance-deadlines` (hourly, emits `grievance.overdue` once per case and kind), `grievance-retention` (daily: erase contact after N months, purge case + files after N years unless legal hold, audit `grievance.purged`), `grievance-notify` (content-free emails).
- Repositories: `channels.repository.ts`, `cases.repository.ts`, `messages.repository.ts`, `handlers.repository.ts` — Prisma only, inside `prisma.withTenant`.

## Invariants

- Decrypted content never leaves handler-authorised services: not in logs, events, audit diffs, notifications or exports.
- Anonymous reports store no IP, name or contact; IP hashes use a daily salt deleted after 30 days.
- Non-appointed members, other workspaces and platform staff get `404` for a case.
- Transitions only through the state machine; deadlines computed only by `engine/deadlines.ts`.

## Tests

- Unit: `engine/case-state.spec.ts`, `engine/deadlines.spec.ts`, `engine/stats.spec.ts` + `*.property.spec.ts`.
- E2e (planned): `test/grievances-public.e2e-spec.ts` (US-25-1, -2, -3), `test/grievances-cases.e2e-spec.ts` (US-25-4, -5), `test/grievances-stats.e2e-spec.ts` (US-25-6), `test/grievances-retention.e2e-spec.ts` (US-25-7); log-capture test proving no content in logs. Add `grievances` to `spec-coverage.json`.

## Not here

Corrective action plans (`corrective-actions`), risk scoring (`risk`), the supplier record (`supplier-register`), report rendering (`dd-reporting`), internal whistleblowing under the EU Whistleblower Directive (out of scope, M25 §4.3).
