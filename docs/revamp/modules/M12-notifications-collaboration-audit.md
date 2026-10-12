# M12 — Notifications, Collaboration & Audit Trail

> Status: Ready · Phase: 1 (audit + email core, event bus, notification centre) → 2 (real-time stream, comments, "My work") → 3 (Teams/Slack) · Depends on: M01, M02 · Used by: all modules
> Legacy code: BE `services/nodeMaler.js` (GoDaddy SMTP, hardcoded credentials), `services/Mailer.js` (SendGrid, unused), `controllers/{assessment,suppliers,authentication,surveys}.js` (inline HTML emails), `handlers/logger.js` + `models/logs.js` (request logger storing bodies), `Cronjob/cronjobs.js` (broken) · FE: none (no notification UI; Atlassian service-desk link)
> Modules: the audit trail (§2.4) is built as `src/modules/audit` (card `src/modules/audit/CLAUDE.md`, wave 0). Everything else in this spec belongs to `notifications` (contract §14, wave 1) except the Phase 2–3 collaboration features, which get their own contract later (§11). Sections follow `_TEMPLATE.md` from §5 on; §1–§4 keep their numbers so existing references (M12 §2.4, §3) stay valid.

## 1. Purpose
Keep multi-person, multi-week assessments moving (notifications, reminders, assignments, comments) and make every important change **traceable** for auditors (CSRD limited assurance) and for security.

## 2. Scope
### 2.1 Email (transactional)
- Single `NotificationService` → `email` queue → `EmailAdapter` (default Postmark; SMTP adapter for other providers — no AWS SES); templates in React Email, localised (M15), with plain-text part, workspace branding, unsubscribe/preferences link for non-critical mail.
- Sender: `notifications@resilisense.org` (SPF/DKIM/DMARC aligned); display name "<Company> via ResiliSense" for survey/supplier mail; reply-to where meaningful.
- Events inventory (replaces the legacy scattered emails): invitation, email verification, password reset, new-device login, MFA change; project submitted for review (assessor inbox), review round completed, workstream transitions; assignment created, due soon, overdue; survey invite/reminder (M08); supplier invite/access request/decision; KPI data request/due/overdue; report ready/shared; certificate expiring; AI job complete; weekly digest. Each emitting module owns its templates and calls `NotificationService` (§7.1); notifications owns the layout, sending, tracking and preferences.
- Delivery tracking via provider webhooks (bounce, complaint, delivery) → `email_messages`; suppression list honoured.

### 2.2 In-app notification centre
- Bell with unread count, list grouped by day, filters (mentions, assignments, reviews, system), mark read/all, deep links; real-time via Server-Sent Events (`GET /v1/notifications/stream`, Phase 2), polling of the unread count until then and as the fallback.
- **Preferences** per user × category × channel (in-app, email, digest daily/weekly, none); workspace defaults; critical security mails not optional.
- Optional **Microsoft Teams / Slack** webhooks per workspace for project events (Phase 3).

### 2.3 Collaboration
- **Comments** on any commentable entity (KC answer, issue, file assessment, IRO, action, KPI value, report section): threads, @mentions (members only), resolve/reopen, edit window 15 min, attachments via M14.
- **Assignments & tasks**: the assignment model from M03 powers "My work" (`/inbox`): assigned questions, reviews, data requests, approvals, due dates; bulk complete where applicable.
- **Activity feed** per project/company built from audit events (human-readable, filterable).

### 2.4 Audit trail
- Append-only `audit_events` (DB role has INSERT only; no UPDATE/DELETE). The table is created by the first M01 PR in minimal form (columns of §3, RLS: insert always, select only within the current workspace or an explicit platform scope, no update/delete policy); M12 adds the hash chain, monthly partitioning and the read API, hash-chained per workspace (`prev_hash`) to detect tampering; retained ≥ 7 years (configurable per contract).
- Captures: actor (user/impersonator/system/API token), action, entity type/id, workspace, before/after diff for data changes (PII-redacted), IP hash, user agent, request id.
- Coverage: all auth/security events (M01), membership & entitlement changes, every answer/score/value change, state transitions, review decisions, overrides, exports/downloads/shares, deletions/restores, AI suggestion decisions, platform cross-tenant access.
- Auditor UI: searchable log with filters and CSV export; per-entity "History" tab.
- **Request logging** is operational only (pino JSON to container stdout → shipped by Grafana Alloy/Vector to Grafana/Loki, bodies never logged); the legacy `logs` collection is not migrated.

### 2.5 Scheduled jobs (BullMQ repeatables)
Due-soon/overdue scan (hourly), survey auto-reminders & auto-close, digest emails (daily 07:00 user TZ / weekly Monday), certificate expiry, token/session cleanup, report schedules, data-retention purge, SLA escalation (M05). Each job belongs to the module whose data it scans; notifications owns the digest, the event relay and its own retention purge.

### 2.6 Domain event bus
- The event bus of `06-modular-build.md` §3.2: a module publishes `<entity>.<verb>` events inside its own transaction; other modules react in the worker. It replaces the direct service calls modules use until it exists.
- Transactional outbox (`domain_events`), relayed to the BullMQ `events` queue, one job per subscriber; at-least-once delivery, idempotent handlers (§7.4).

## 3. Domain model
```ts
notifications { id, workspace_id, user_id, category, type, title_key, params jsonb, link, dedupe_key?, read_at?, emailed_at?, created_at }
notification_preferences { workspace_id, user_id, category, channel: 'in_app'|'email', frequency: 'instant'|'daily'|'weekly'|'off', updated_at,
                           primary key(workspace_id, user_id, category, channel) }
notification_defaults { workspace_id, category, channel, frequency, updated_by, updated_at, primary key(workspace_id, category, channel) }
email_messages { id, workspace_id?, user_id?, to_address? (cleared after 30 days), stream, template, locale, ref_type?, ref_id?, idempotency_key?,
                 status: 'queued'|'sent'|'delivered'|'bounced'|'complained'|'suppressed'|'failed', provider?, provider_message_id?,
                 events jsonb, created_at, updated_at, unique(workspace_id, idempotency_key) }      -- the outbox M08 §6 refers to
email_suppressions { address_hash (HMAC of the lower-cased address) primary key, reason: 'hard_bounce'|'complaint'|'manual', created_at }   -- platform table
domain_events { id (UUIDv7), workspace_id?, name, payload jsonb, occurred_at, published_at? }   -- outbox of the event bus
comments { id, workspace_id, entity_type, entity_id, parent_id?, author_id, body (markdown subset), mentions uuid[], resolved_at?, resolved_by?, edited_at?, deleted_at?, created_at }
audit_events { id bigserial, workspace_id?, occurred_at, actor_type, actor_id?, impersonator_id?, action, entity_type, entity_id?, diff jsonb?,
               request_id, ip_hash?, user_agent?, prev_hash, hash }           -- partitioned by month
webhook_endpoints { id, workspace_id, kind: 'teams'|'slack'|'generic', url_enc, events text[], secret_enc, active }
```
- Tenant tables (`notifications`, `notification_preferences`, `notification_defaults`, `email_messages`, `domain_events`) carry `workspace_id`, RLS `ENABLE` + `FORCE`; rows with a null `workspace_id` (account mail of M01, platform events) are read only through explicit, audited system repository methods (CLAUDE.md tenancy rule).
- Foreign keys only to kernel tables: `workspaces`, `users`. `ref_type`/`ref_id` on `email_messages` are the sending module's own reference (e.g. `questionnaire_recipient`), stored as text + uuid, never joined.
- Indexes: `notifications (workspace_id, user_id, created_at desc)`, partial `(workspace_id, user_id) where read_at is null`; `email_messages (provider_message_id)`, `(workspace_id, ref_type, ref_id)`; `domain_events (occurred_at) where published_at is null`.

## 4. API contract (REST `/v1`)

| Route | Permission | Slice |
|---|---|---|
| `GET /notifications?cursor=&category=&unread=` · `GET /notifications/unread-count` · `POST /notifications/read` `{ ids } \| { all: true }` | authenticated (own, current workspace) | 1 |
| `GET/PUT /me/notification-preferences` | authenticated | 1 |
| `GET/PUT /notification-defaults` (workspace defaults) | `workspace:manage` | 1 |
| `POST /notifications/unsubscribe` `{ token }` (one-click, RFC 8058) | public, rate-limited, signed token | 1 |
| `POST /email-events/postmark` (delivery, bounce, spam-complaint webhooks) | public, rate-limited, provider credentials checked | 1 |
| `GET /notifications/stream` (SSE) | authenticated | 2 |
| `GET /comments?entityType=&entityId=` · `POST /comments` · `PATCH/DELETE /comments/:id` · `POST /comments/:id/resolve` | read/write permission of the entity | 2 |
| `GET /inbox` (my assignments/tasks) | authenticated | 2 |
| `GET /audit-events?entityType=&entityId=&actor=&from=&to=` · `GET /audit-events/export.csv` | `audit:read` | audit |
| `GET /projects/:pid/activity` | `project:read` | audit |
| `GET/POST/DELETE /workspaces/current/webhooks` | `workspace:manage` | 3 |

Responses: notification items `{ id, category, type, titleKey, params, link, readAt, createdAt }`, cursor-paginated newest first; preferences `{ categories: [{ category, critical, channels: { in_app, email } }] }` with each channel's `frequency` and `source: 'user'|'workspace'|'default'`. Errors are problem+json: `validation_failed` (unknown category, turning a critical category off), `invalid_token` (unsubscribe), `unauthenticated`, `forbidden`, `rate_limited`.

## 5. User stories & acceptance criteria
- **US-12-1** As a workspace member I see a bell with my unread count and my latest notifications; opening one marks it read and takes me to the record.
  - AC: only notifications of the current workspace and of the caller are listed or counted; another workspace's notification id in `POST /notifications/read` changes nothing; the count refreshes every 60 s while the tab is visible and after every mark-read; links are app-relative paths.
- **US-12-2** As a workspace member I open "All notifications", filter by category and unread, and mark one or all as read.
  - AC: filters and the cursor live in the URL; "Load more" fetches the next page (no auto-loading scroll); empty, loading and error states as in 02 §5.
- **US-12-3** As a workspace member I choose, per category and channel, instant, daily digest, weekly digest or off; security notifications cannot be turned off.
  - AC: the matrix shows where each value comes from (mine, workspace default, ResiliSense default); turning a critical category off answers 400 `validation_failed`; the next `notify()` follows the new choice.
- **US-12-4** As a workspace admin I set the default preferences of my workspace, which apply to every member who has not chosen otherwise.
  - AC: needs `workspace:manage` (others 403); critical categories cannot be turned off; audit `notification_defaults.updated`.
- **US-12-5** As the recipient of a non-critical email I unsubscribe from that category with one click from the email, without signing in.
  - AC: the email carries `List-Unsubscribe` and `List-Unsubscribe-Post`; the signed token names user, workspace and category and is accepted again without error; it sets that category's email channel to off; a tampered token answers 400 `invalid_token`; security mail has no unsubscribe link.
- **US-12-6** As a member with a digest preference I receive one email per period (daily 07:00, weekly Monday 07:00, my time zone) listing what I have not read since the last digest, and none when there is nothing new.
- **US-12-7** As a buyer whose email to a supplier contact bounced, I see that the address failed, and the platform does not mail it again until it is cleared.
  - AC: a hard bounce or spam complaint adds the address to the suppression list and emits `email.failed`; a later send to it is stored as `suppressed`, not sent, and emits `email.failed`; soft bounces are left to the provider's retries; delivery events update `email_messages.status`.
- **US-12-8** As the platform I deliver every domain event published in a committed transaction to every subscriber at least once, even across worker restarts, and never an event whose transaction rolled back.
  - AC: a subscriber that fails is retried with backoff (5 attempts) without blocking the other subscribers; a handler that receives the same event twice has no extra effect.

## 6. UI
Top-bar bell + popover; `/notifications` (all notifications); `/settings/notifications` (my preferences · workspace defaults); `/unsubscribe` (public, auth layout); "My work" `/inbox` (Phase 2); comments side panel pattern (context panel "Comments" tab, Phase 2); `/audit` (auditor/admin) with DataTable + diff viewer; "History" tab on entities.
- Bell (`src/features/notifications`, mounted by the app shell): icon button with the unread count as a badge ("9+" above nine) and an accessible name that includes the count; popover with the latest 10 grouped by day (Today, Yesterday, date), "Mark all as read", "View all". No pulse or animation when the count changes (02 §9: nothing moves on its own).
- Notification text is `t(titleKey, params)`: keys live in the emitting feature's namespace (`<namespace>:notifications.<type>`); an unknown key falls back to a generic "New activity" line. Params are rendered as text, never HTML.

## 7. Business rules
### 7.1 `notify()` and `sendEmail()`
- `notify()` takes a workspace, recipient user ids, a category, a type (the event name), a `titleKey` + params, an app-relative link, an optional email (template + props) and an optional `dedupeKey`. Recipients who are not active members of the workspace are dropped (counted in the log, never an error to the caller). It runs in the caller's transaction when one is given, so a rolled-back change sends nothing.
- Per recipient and channel the frequency is resolved: the user's preference → the workspace default → the code default (`DEFAULT_PREFERENCES`). Critical categories (`security`) and calls marked `critical` are always in-app + instant email.
- Same `(user, dedupeKey)` within 24 h → no new notification and no email.
- `sendEmail()` sends to an address that is not necessarily a user (supplier contact, survey respondent, grievance reporter): template + props, locale, stream, optional `senderName` ("<senderName> via ResiliSense"), `replyTo`, `ref` (`{ type, id }` of the caller) and `idempotencyKey` (unique per workspace; a repeat returns the first message).
- Templates are owned by the emitting module (`src/modules/<module>/emails/`), defined with `defineEmailTemplate()` and rendered with the shared layout (branding, footer, preferences / unsubscribe link for non-critical mail, plain-text part) when the email is queued; the worker only sends. English copy until M15 provides the backend message catalogue; the locale is stored on the message.

### 7.2 Email delivery
- Suppression: hard bounce or spam complaint → `email_suppressions` (keyed hash of the address); every send checks it first. Soft bounces are not suppressed.
- Provider webhooks map to `delivered`, `bounced`, `complained`; the message id is found through the metadata sent with it (`email_message_id`, `workspace_id`), so the update runs in that tenant.
- Emails queued before this module (M01 `IdentityMailer` jobs without an `email_message_id`) are still sent, untracked, until identity moves to `sendEmail()`.

### 7.3 Digests
- Hourly job: for each user whose local time is 07:00 (daily) or Monday 07:00 (weekly), one digest per workspace with the unread notifications created since the last digest whose email frequency is `daily`/`weekly`; nothing sent when empty; `emailed_at` set on the included rows.

### 7.4 Event bus
- `EventBus.publish(event, tx)` inserts into `domain_events` inside the emitter's transaction. A relay in the worker claims unpublished rows (`FOR UPDATE SKIP LOCKED`, batches of 100, at least every 2 s), enqueues one `events` job per subscriber with job id `<eventId>:<subscriberId>` and sets `published_at`.
- Subscribers are worker providers whose methods carry `@OnDomainEvent('<name>', '<subscriberId>')`; the subscriber id is stable (`<module>.<reaction>`). Handlers must be idempotent (keyed by event id) and order-tolerant: no ordering is guaranteed between events.
- Payloads carry ids and small facts only (no personal data, no secrets); each emitter exports the payload type and Zod schema with the event name constant.

### 7.5 Retention
- Read notifications are deleted after 90 days, all notifications after 365 days; `email_messages.to_address` is cleared after 30 days and rows deleted after 365 days; published `domain_events` after 7 days. Defaults, configurable by env.

## 8. Events, notifications & audit
- Emits `email.failed` → `{ emailMessageId, workspaceId, reason: 'bounced'|'complained'|'suppressed'|'failed', ref?: { type, id } }` for the sending module to flag the contact.
- Consumes `membership.removed` (once identity publishes it on the bus) → delete that user's notifications and preferences in the workspace.
- Audit: `notification_defaults.updated`, `notification_preferences.updated`, `email_suppression.added`, `email_suppression.removed`.

## 9. Users & permissions

| Role | Can |
|---|---|
| Any signed-in member | Read and mark own notifications, set own preferences (current workspace) |
| workspace_owner / workspace_admin | Workspace defaults (`workspace:manage`) |
| auditor, owner, admin | Audit trail (`audit:read`, audit slice) |
| Public | One-click unsubscribe with a signed token; provider webhooks with provider credentials |

## 10. Migration from legacy
Nothing to migrate: legacy has no notification store, its `logs` collection is not migrated (§2.4) and legacy email addresses are not suppression data.

## 11. Implementation slices
- **Slice 1 · `notifications` (wave 1)** — event bus, `notify()` / `sendEmail()`, email outbox + delivery webhooks + suppression, in-app list / unread count / mark read, preferences + workspace defaults, one-click unsubscribe, digests, retention. Contract §14.
- **Slice 2** — SSE stream, comments with mentions, "My work" (needs M03/M09 assignments). Folder decided by its own `/module-contract` run (proposed `collaboration`).
- **Slice 3** — Teams/Slack webhooks.
- **Audit** — built in `src/modules/audit`; hash chain, partitioning and the read API extend that module.

## 12. Test plan
- Template rendering snapshot per locale; preference resolution matrix (user → workspace → default, critical locks) as table-driven unit tests.
- RLS isolation for every tenant table; another workspace's notification ids have no effect.
- Event bus: rolled-back transaction publishes nothing; relay crash between enqueue and `published_at` still yields one effect per subscriber; one failing subscriber does not block another.
- Suppression and webhook mapping; unsubscribe token tampering; digest time-zone boundaries (07:00 local, DST change).
- Audit immutability (DB permission test) and hash-chain verification job; PII redaction in diffs; mention permissions (cannot mention non-members) — audit and slice 2.
- SSE reconnection — slice 2.

## 13. Open questions
None open for slice 1. Answered by the plan or an owner decision:
- Email provider: Postmark by default, SMTP for any other, never AWS SES (ADR-010, ADR-011).
- Real-time: polling the unread count first, SSE in slice 2 (§2.2 already names polling as the fallback).
- Comments, "My work" and Teams/Slack are not in the wave-1 contract: the catalogue gives `notifications` the notifications, the email outbox and the event bus (`06` §5).

## 14. Module contract
Filled by `/module-contract` (`06-modular-build.md` §2.1, §3). Folder: `src/modules/notifications/` · `src/features/notifications/` · Wave: 1. The audit slice keeps its own contract (`src/modules/audit/CLAUDE.md`).

| | |
|---|---|
| Owns | Tables `notifications`, `notification_preferences`, `notification_defaults`, `email_messages`, `email_suppressions`, `domain_events`; routes `/v1/notifications*`, `/v1/me/notification-preferences`, `/v1/notification-defaults`, `/v1/email-events/postmark`; queue `events` and the `email` processor; scheduled tasks digest, event relay, retention purge; permission used `workspace:manage` (no new permission); i18n namespace `notifications`; screens bell, `/notifications`, `/settings/notifications`, `/unsubscribe` |
| Public surface (`index.ts`) | `NotificationsModule` (app + worker); `NotificationService.notify(input, tx?)` (supplier-portal, questionnaires, grievances, every module that tells a user something); `NotificationService.sendEmail(input, tx?)` (questionnaires respondents, supplier-portal invites, grievance reporters; identity later); `NotificationService.emailStatuses(workspaceId, ref)` (questionnaires, supplier-portal show bounced contacts); `EventBus.publish(event, tx)` (every emitting module); `OnDomainEvent(name, subscriberId)` decorator (risk, monitoring, corrective-actions, …); `defineEmailTemplate`, types `DomainEvent`, `NotifyInput`, `SendEmailInput`, `EmailTemplate`, `NotificationCategory`; constants `NOTIFICATION_CATEGORIES`, `NotificationEvents` (`email.failed`). Frontend `index.ts`: `NotificationBell` (app shell), `notificationSettingsRoutes` (spread by `settings`), `notificationsRoutes`, `unsubscribeRoutes` (router) |
| Depends on | `identity`: `UsersRepository.findManyByIds` (exported) and a new recipients read model `activeMembers(workspaceId, userIds)` → `{ userId, email, name, locale, timezone }`, added to identity's `index.ts` in the notifications build PR; fake `__tests__/fakes/identity.fake.ts`. `audit`: `AuditService.record` (built; real service in e2e). Kernel: `infra/email` (`EmailAdapter`), `infra/queue`, `infra/prisma`, `infra/rate-limit`. Frontend: generated `notifications` hooks only |
| Emits | `email.failed` → `{ emailMessageId, workspaceId, reason, ref? }` |
| Consumes | `membership.removed` → delete the user's notifications and preferences in that workspace (once identity publishes on the bus) |
