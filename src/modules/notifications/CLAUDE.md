# Notifications & event bus (M12 · SD13)

> Spec: `docs/revamp/modules/M12-notifications-collaboration-audit.md` (slice 1, §14) · Status: Ready · Wave: 1

## Purpose

Tells people what happened and lets modules react to each other. Every module that informs a user calls `NotificationService`; every module that announces a fact publishes it on the `EventBus`. This module owns the in-app notification centre, preferences, the email outbox with delivery tracking and suppression, digests and the transactional outbox of domain events. Planned, nothing built yet.

## Owns

- Tables (planned): `notifications`, `notification_preferences`, `notification_defaults`, `email_messages`, `domain_events` (tenant tables: `workspace_id`, RLS `ENABLE` + `FORCE`, null `workspace_id` rows only through audited system repository methods), `email_suppressions` (platform table, keyed address hash). FKs only to `workspaces`, `users`.
- Routes (M12 §4, slice 1):

| Route                                                         | Guard                                           |
| ------------------------------------------------------------- | ----------------------------------------------- |
| `GET /v1/notifications`, `GET /v1/notifications/unread-count` | `@Authenticated()` (caller, current workspace)  |
| `POST /v1/notifications/read` `{ ids } \| { all: true }`      | `@Authenticated()`                              |
| `GET/PUT /v1/me/notification-preferences`                     | `@Authenticated()`                              |
| `GET/PUT /v1/notification-defaults`                           | `@Can('workspace:manage')`                      |
| `POST /v1/notifications/unsubscribe` `{ token }`              | `@Public()`, rate-limited, signed token         |
| `POST /v1/email-events/postmark`                              | `@Public()`, rate-limited, provider credentials |

- No new permission strings. Queue `events` (add to `QUEUES` in `infra/queue/queues.ts`) and the `email` processor (moves here from `src/worker.ts`). Scheduled tasks: `notifications-digest` (hourly), `notifications-retention` (daily). Event relay: worker loop, at least every 2 s.
- Event/audit names in `events.ts` (`NotificationEvents`): `email.failed`; audit `notification_defaults.updated`, `notification_preferences.updated`, `email_suppression.added`, `email_suppression.removed`.

## Public surface (`index.ts`, planned)

| Export                                                                 | Why others need it                                                                                              |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `NotificationsModule`                                                  | Registered in `app.module.ts` and `src/worker.ts`                                                               |
| `NotificationService.notify(input, tx?)`                               | Tell workspace members something: in-app + email by preference (supplier-portal, questionnaires, grievances, …) |
| `NotificationService.sendEmail(input, tx?)`                            | Mail an address that may not be a user (respondents, supplier contacts, grievance reporters; identity later)    |
| `NotificationService.emailStatuses(workspaceId, ref)`                  | Show which contacts bounced (questionnaires, supplier-portal)                                                   |
| `EventBus.publish(event, tx)`                                          | Publish a domain event inside the emitter's transaction (every emitting module)                                 |
| `OnDomainEvent(name, subscriberId)`                                    | Decorator for worker handlers that react to events (risk, monitoring, corrective-actions, …)                    |
| `defineEmailTemplate`, `EmailTemplate`                                 | Each module defines its own email templates in `src/modules/<module>/emails/`                                   |
| `DomainEvent`, `NotifyInput`, `SendEmailInput`, `NotificationCategory` | Types of what callers pass                                                                                      |
| `NOTIFICATION_CATEGORIES`, `NotificationEvents`                        | Category ids for `notify()`; `email.failed` name for subscribers                                                |

## Depends on

- `identity`: `UsersRepository.findManyByIds` (exported) and a new read model `activeMembers(workspaceId, userIds)` → `{ userId, email, name, locale, timezone }`, added to identity's `index.ts` (with a line in its card) in the build PR. Fake: `__tests__/fakes/identity.fake.ts`.
- `audit`: `AuditService.record` (built; the real service runs in e2e).
- Kernel: `infra/email` (`EMAIL_ADAPTER`), `infra/queue`, `infra/prisma`, `infra/rate-limit`, `config` (new env: unsubscribe signing key, email hash key, Postmark webhook credentials, retention days; add to the Zod env schema and `.env.example`).

## Events

- Emits `email.failed` → `{ emailMessageId, workspaceId, reason: 'bounced'|'complained'|'suppressed'|'failed', ref?: { type, id } }`.
- Consumes `membership.removed` → delete that user's notifications and preferences in the workspace (only once identity publishes it on the bus; until then nothing).

## Components & behaviour

- `notification.service.ts` — `notify()`: drops recipients that are not active members (logs the count), dedupes on `(user, dedupeKey)` for 24 h, resolves frequency per channel with `engine/preferences.ts`, writes `notifications`, renders and queues instant emails. `sendEmail()`: checks `email_suppressions`, honours `idempotencyKey` (unique per workspace), renders the template with the shared layout, writes `email_messages` (`queued`) and enqueues on `email` with `email_message_id` + `workspace_id` metadata. Runs in the caller's `tx` when given.
- `engine/preferences.ts` (pure) — `resolveFrequency(userPrefs, workspaceDefaults, DEFAULT_PREFERENCES, category, channel)` → `{ frequency, source }`; critical categories (`security`, or `critical: true`) always `instant` on both channels. Table-driven + property tests.
- `engine/digest.ts` (pure) — which users are due at a given UTC instant (07:00 local daily, Monday 07:00 weekly, DST-safe) and which notifications go in.
- `emails/layout.tsx` + `defineEmailTemplate()` — React Email layout: branding, footer, preferences link, `List-Unsubscribe` / `List-Unsubscribe-Post` and the one-click link for non-critical mail, plain-text part; `senderName` → "<senderName> via ResiliSense". English until M15.
- `email.processor.ts` — the single `email` queue processor: sends through `EmailAdapter`, sets `sent` + `provider_message_id`; jobs without `email_message_id` (M01 `IdentityMailer`) are sent untracked.
- `email-events.controller.ts` — Postmark webhooks → `delivered` / `bounced` / `complained` in the message's tenant; hard bounce or complaint → suppression + `email.failed`.
- `event-bus.ts` — `publish()` inserts into `domain_events` in the caller's transaction (never outside one). `event-relay.ts` (worker) claims unpublished rows `FOR UPDATE SKIP LOCKED` in batches of 100 and enqueues one `events` job per subscriber with job id `<eventId>:<subscriberId>`. `event-dispatcher.processor.ts` finds `@OnDomainEvent` handlers via Nest discovery and runs the one named by the job.
- `notifications.controller.ts`, `preferences.controller.ts` — HTTP only; cursor pagination newest first; `POST /read` touches only the caller's rows in the current workspace.
- `unsubscribe.controller.ts` — verifies the HMAC token (user, workspace, category), sets that email channel to `off`, idempotent.
- `notifications-digest.task.ts`, `notifications-retention.task.ts` — `ScheduledTask`s registered in `src/worker.ts` (retention: read notifications 90 days, all 365; `to_address` cleared after 30 days, messages 365 days; published events 7 days).

## Invariants

- A notification is only ever visible to its recipient in its workspace; another workspace's ids have no effect (RLS + isolation tests).
- A rolled-back transaction publishes no event and sends no email; every committed event reaches every subscriber at least once; handlers are idempotent by event id.
- Critical (security) notifications cannot be turned off, by a user or a workspace default.
- No email bodies, addresses or tokens in logs (`maskEmail`); event payloads carry ids, never personal data.
- Links are app-relative paths starting with `/` (no open redirect); emails prefix `APP_BASE_URL`.

## Tests

Planned: `engine/preferences.spec.ts` + `.property.spec.ts`, `engine/digest.spec.ts` + `.property.spec.ts`; e2e `test/notifications-centre.e2e-spec.ts` (US-12-1–4, other workspace, forbidden role), `test/notifications-email.e2e-spec.ts` (US-12-5–7: unsubscribe, digest, webhooks, suppression), `test/notifications-event-bus.e2e-spec.ts` (US-12-8: rollback, relay crash, failing subscriber); extend `tenancy-rls`, `route-authorization` and `route-access-matrix`. Add `M12` to `spec-coverage.json`.

## Not here

Audit trail (`audit`). Comments, "My work" inbox, SSE stream (M12 slice 2) and Teams/Slack webhooks (slice 3) get their own contract. Email copy of other modules (their `emails/` folders). Who should be notified of what: the emitting module decides and calls `notify()`; this module never maps other modules' events to notifications.
