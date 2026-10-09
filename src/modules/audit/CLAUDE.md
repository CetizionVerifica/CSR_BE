# Audit trail (M12 audit slice · SD13)

> Spec: `docs/revamp/modules/M12-notifications-collaboration-audit.md` (audit part) · Status: In progress · Wave: 0

## Purpose

Append-only record of data changes and security events, used for the activity feeds, the auditor view and the due diligence "who viewed shared supplier data" log.

## Owns

- Table: `audit_events` (append-only; IP addresses stored only as a keyed hash).
- No routes of its own yet; feeds are served by the modules that show them (e.g. company activity in `workspaces`).

## Public surface (`index.ts`)

| Export                     | Why others need it                                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `AuditModule`              | Registered in `app.module.ts`                                                                               |
| `AuditService`             | `record(entries, meta, tx?)`: pass the caller's tenant transaction so the audit row commits with the change |
| `AuditActor`, `AuditEntry` | Types of what a caller passes                                                                               |

## Depends on

Kernel only (`config`, `infra/prisma`, `common/http/request-meta`). Must never import another module: everyone depends on audit.

## Components & behaviour

- `audit.service.ts` — turns one or many entries (actor, action name from the caller's `events.ts`, target, details without secrets) plus request meta into rows, in the caller's transaction when one is given.
- `audit.repository.ts` — inserts only; there is no update or delete path.

## Invariants

- Action names are the stable `<entity>.<verb>` strings exported by the emitting module.
- No secrets or personal data beyond ids and the minimum needed (M12, CLAUDE.md logging rules).

## Tests

Covered through the e2e suites of the modules that record events (`test/identity-*.e2e-spec.ts`, `test/workspaces-companies.e2e-spec.ts`).

## Not here

Notifications, email outbox and the event bus (`notifications`, rest of M12).
