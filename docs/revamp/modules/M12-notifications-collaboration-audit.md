# M12 — Notifications, Collaboration & Audit Trail

> Status: Draft · Phase: 1 (audit + email core) → 2 (notification centre, comments) · Depends on: M01, M02 · Used by: all modules
> Legacy code: BE `services/nodeMaler.js` (GoDaddy SMTP, hardcoded credentials), `services/Mailer.js` (SendGrid, unused), `controllers/{assessment,suppliers,authentication,surveys}.js` (inline HTML emails), `handlers/logger.js` + `models/logs.js` (request logger storing bodies), `Cronjob/cronjobs.js` (broken) · FE: none (no notification UI; Atlassian service-desk link)

## 1. Purpose
Keep multi-person, multi-week assessments moving (notifications, reminders, assignments, comments) and make every important change **traceable** for auditors (CSRD limited assurance) and for security.

## 2. Scope
### 2.1 Email (transactional)
- Single `NotificationService` → `email` queue → Amazon SES; templates in React Email, localised (M15), with plain-text part, workspace branding, unsubscribe/preferences link for non-critical mail.
- Sender: `notifications@resilisense.org` (SPF/DKIM/DMARC aligned); display name "<Company> via ResiliSense" for survey/supplier mail; reply-to where meaningful.
- Events inventory (replaces the legacy scattered emails): invitation, email verification, password reset, new-device login, MFA change; project submitted for review (assessor inbox), review round completed, workstream transitions; assignment created, due soon, overdue; survey invite/reminder (M08); supplier invite/access request/decision; KPI data request/due/overdue; report ready/shared; certificate expiring; AI job complete; weekly digest.
- Delivery tracking via SES events (bounce, complaint, delivery) → `email_messages`; suppression list honoured.

### 2.2 In-app notification centre
- Bell with unread count, list grouped by day, filters (mentions, assignments, reviews, system), mark read/all, deep links; real-time via Server-Sent Events (`GET /v1/notifications/stream`), fallback polling.
- **Preferences** per user × category × channel (in-app, email, digest daily/weekly, none); workspace defaults; critical security mails not optional.
- Optional **Microsoft Teams / Slack** webhooks per workspace for project events (Phase 3).

### 2.3 Collaboration
- **Comments** on any commentable entity (KC answer, issue, file assessment, IRO, action, KPI value, report section): threads, @mentions (members only), resolve/reopen, edit window 15 min, attachments via M14.
- **Assignments & tasks**: the assignment model from M03 powers "My work" (`/inbox`): assigned questions, reviews, data requests, approvals, due dates; bulk complete where applicable.
- **Activity feed** per project/company built from audit events (human-readable, filterable).

### 2.4 Audit trail
- Append-only `audit_events` (DB role has INSERT only; no UPDATE/DELETE), hash-chained per workspace (`prev_hash`) to detect tampering; retained ≥ 7 years (configurable per contract).
- Captures: actor (user/impersonator/system/API token), action, entity type/id, workspace, before/after diff for data changes (PII-redacted), IP hash, user agent, request id.
- Coverage: all auth/security events (M01), membership & entitlement changes, every answer/score/value change, state transitions, review decisions, overrides, exports/downloads/shares, deletions/restores, AI suggestion decisions, platform cross-tenant access.
- Auditor UI: searchable log with filters and CSV export; per-entity "History" tab.
- **Request logging** is operational only (pino → CloudWatch, bodies never logged); the legacy `logs` collection is not migrated.

### 2.5 Scheduled jobs (BullMQ repeatables)
Due-soon/overdue scan (hourly), survey auto-reminders & auto-close, digest emails (daily 07:00 user TZ / weekly Monday), certificate expiry, token/session cleanup, report schedules, data-retention purge, SLA escalation (M05).

## 3. Domain model
```ts
notifications { id, workspace_id, user_id, category, type, title_key, params jsonb, link, read_at?, created_at }
notification_preferences { user_id, workspace_id?, category, channel, frequency, primary key(user_id, workspace_id, category, channel) }
comments { id, workspace_id, entity_type, entity_id, parent_id?, author_id, body (markdown subset), mentions uuid[], resolved_at?, resolved_by?, edited_at?, deleted_at?, created_at }
audit_events { id bigserial, workspace_id?, occurred_at, actor_type, actor_id?, impersonator_id?, action, entity_type, entity_id?, diff jsonb?,
               request_id, ip_hash?, user_agent?, prev_hash, hash }           -- partitioned by month
email_messages { … see M08 }
webhook_endpoints { id, workspace_id, kind: 'teams'|'slack'|'generic', url_enc, events text[], secret_enc, active }
```

## 4. API contract (REST `/v1`)
| Route | Permission |
|---|---|
| `GET /notifications?cursor=` · `POST /notifications/read` `{ ids|all }` · `GET /notifications/stream` (SSE) | authenticated |
| `GET/PUT /me/notification-preferences` | authenticated |
| `GET /comments?entityType=&entityId=` · `POST /comments` · `PATCH/DELETE /comments/:id` · `POST /comments/:id/resolve` | read/write permission of the entity |
| `GET /inbox` (my assignments/tasks) | authenticated |
| `GET /audit-events?entityType=&entityId=&actor=&from=&to=` · `GET /audit-events/export.csv` | `audit:read` |
| `GET /projects/:pid/activity` | `project:read` |
| `GET/POST/DELETE /workspaces/current/webhooks` | `workspace:manage` |

## 5. UI
Top-bar bell + popover; `/inbox` ("My work") page; comments side panel pattern (context panel "Comments" tab); `/settings/notifications`; `/audit` (auditor/admin) with DataTable + diff viewer; "History" tab on entities.

## 6. Test plan
Template rendering snapshot per locale; preference matrix; SSE reconnection; audit immutability (DB permission test) and hash-chain verification job; PII redaction in diffs; mention permissions (cannot mention non-members).
