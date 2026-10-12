# M25 — Grievances (complaints procedure for supply chain due diligence)

> Status: Draft · Phase: C (built in wave 2) · Depends on: M01, M02, M12 (notifications, audit), M13 (reference-data categories), M14 (files), M19 (supplier-register) · Blocks: M22 (risk signal), M24 (monitoring), M11/M16 (LkSG/CSDDD reporting)
> Parent: plan SD11; M10 has no grievance section (nothing in M10 is superseded; M10 §1 "due-diligence obligations" now points here for the complaints procedure).
> Legacy code: none (new capability).

## 1. Purpose

Give workers, communities and their representatives a **safe, accessible channel** to report human-rights and environmental harms linked to a buyer's own operations or its suppliers, and give the buyer a **confidential case-handling workflow** that meets the complaints procedure of the German Supply Chain Act (LkSG §8) and the EU CSDDD (complaints procedure / notification mechanism). Reports can be anonymous; the reporter can follow the case and talk to the handler without revealing who they are.

## 2. Users & permissions

| Role                                                          | Can                                                                                                | Permission            |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------- |
| Reporter (public, no account)                                 | Submit a report (anonymous or with contact), add information, read the coarse status, exchange messages using reference + access code | public               |
| Buyer workspace_owner / workspace_admin                       | Configure the channel (texts, languages, categories, retention), appoint case handlers, see anonymised statistics | `grievance:configure` |
| Designated case handler (any member appointed in `grievance_handlers`) | Read and handle cases: triage, assign, message the reporter, link suppliers, record measures, close | `grievance:handle` + handler appointment |
| auditor / compliance officer                                  | Anonymised statistics and procedure-effectiveness report, no case content                         | `grievance:stats`     |
| platform staff                                                | **No access** to case content (no `platform:*` override; support sees only channel configuration) | —                     |

`grievance:handle` is granted by role (owner, admin, contributor) **and** requires an active row in `grievance_handlers`; both are checked server-side. A handler with a declared conflict of interest on a case (e.g. the case concerns them) is excluded from that case. All permissions need entitlement `due_diligence`.

## 3. Current state (legacy)

None. Complaints today arrive by email outside the product and are not linked to suppliers, which leaves LkSG §8 / §10 documentation and the CSDDD effectiveness review without evidence.

## 4. Scope

### 4.1 Must have

- **Public intake form** per workspace channel (`/report/:channelSlug` in the public app): reporter type (worker of a supplier, community member, representative/NGO, own employee, other), category (reference-data list of LkSG/CSDDD protected positions and environmental obligations), country, location, supplier or site as free text (reporter does not know the register), when it happened / ongoing, description, optional attachments (scanned, M14), preferred language, **anonymous** toggle (default on) or contact details (email/phone), consent text, protection-against-reprisal notice.
- **Anti-abuse without CAPTCHA** (accessible): signed form token with issue time (minimum fill time 4 s, maximum 2 h), honeypot field, per-IP-hash and per-channel rate limits, body size limits, duplicate-text detection (flagged for handlers, never merged automatically, §7.3), attachments only after a valid form token and at most 5 × 20 MB. Never fingerprint the reporter beyond a rotating-salt IP hash kept 30 days.
- **Receipt**: reference `GRV-<year>-<6 digits>` and a 128-bit **access code** shown once (and emailed only when the reporter gave an email); reporter follow-up page with reference + code: coarse status, message thread, add information.
- **Case handling** (§7.1 state machine): triage (admissible, in scope, category, severity, urgency), assignment to a handler, acknowledgement to the reporter, investigation notes (internal), link to suppliers from the register and to sites, measures (preventive / remedial, with optional handover to corrective actions), outcome communicated to the reporter, closure with effectiveness review date.
- **Deadlines**: acknowledgement due 7 days after receipt, feedback due 3 months after acknowledgement (both configurable per channel, EU Whistleblower Directive defaults); due-soon and overdue indicators; `grievance.overdue` event.
- **Confidentiality**: case content readable only by appointed handlers; reporter identity fields encrypted at the application level; notifications and audit entries never contain case content (only reference, category, severity); exports for reporting are anonymised aggregates.
- **Retention**: configurable per channel; default: reporter contact data erased 3 months after closure, case record kept 7 years after closure (LkSG §10 documentation duty), attachments kept with the case; daily purge job; legal hold flag stops purging.
- **Statistics** for reporting: cases by category, country, supplier tier, status, time to acknowledge and close — anonymised, small counts (< 3) suppressed.

### 4.2 Later

- Embeddable intake widget (iframe / link button) and QR posters for supplier sites, printable in local languages.
- Intake by voice / SMS / hotline transcription entered by a handler (`channel_source = 'hotline' | 'email' | 'in_person'`).
- Multi-company shared channels (industry initiative, several buyers) — needs a cross-workspace consent model.

### 4.3 Out of scope

Whistleblowing about the buyer's own internal misconduct under the EU Whistleblower Directive (a separate product decision); corrective action plans themselves (corrective-actions, M09 `origin='supplier'`); risk scores (M22 consumes our events).

## 5. User stories & acceptance criteria

- **US-25-1** As a worker I report anonymously from a phone in my language and receive a reference and an access code.
  - AC: Given the channel `acme` with languages en, ar, when I submit a valid report with "anonymous" on, then `201` returns `{ reference, accessCode }`, no IP, email or name is stored, the page works at 360 px and RTL, and `grievance.received` is emitted with no content.
- **US-25-2** Automated or abusive submissions are refused without a CAPTCHA.
  - AC: a submit within 4 s of the form token, with the honeypot filled, or with an expired/forged token answers `400 validation_failed` with a generic message; the 6th submit in an hour from the same IP hash on a channel answers `429 rate_limited`.
- **US-25-3** As a reporter I return with my reference and access code, see the status and answer the handler's question.
  - AC: wrong code 5 times in 15 min locks the reference for 15 min (`429`); the response never reveals whether the reference exists.
- **US-25-4** As an appointed handler I triage, acknowledge, link the case to supplier "X" and record a remedial measure; the reporter sees "acknowledged" and the message.
  - AC: a member who is not appointed gets `404` for the case; transitions outside §7.1 answer `409 invalid_state_transition`.
- **US-25-5** Acknowledgement and feedback deadlines are tracked and overdue cases are flagged.
  - AC: a case received 8 days ago and not acknowledged shows "Acknowledgement overdue" and `grievance.overdue` is emitted once.
- **US-25-6** As a compliance officer I see anonymised statistics for the LkSG annual report without case content.
- **US-25-7** Retention: reporter contact data is erased 3 months after closure and the case 7 years after closure unless under legal hold.

## 6. Domain model

All tables have `workspace_id`, RLS (`ENABLE` + `FORCE`), `created_at/updated_at`. Case reads additionally check the handler appointment in the service.

```ts
grievance_channels  { id, workspace_id, slug unique, company_id → companies, status: 'active'|'paused', languages text[], intro jsonb (per language),
                      categories text[] (reference-data codes), ack_days smallint (7), feedback_days smallint (90),
                      retention: { contactMonths: 3, caseYears: 7 }, allow_attachments boolean }
grievance_handlers  { id, workspace_id, user_id → users, appointed_by → users, appointed_at, revoked_at? }
grievance_cases     { id, workspace_id, channel_id, reference unique, access_code_hash, status (§7.1), source: 'web'|'hotline'|'email'|'in_person',
                      reporter_type, anonymous boolean, reporter_contact_enc bytea?, language, category_code, country_code?, location_text_enc?,
                      supplier_text_enc?, occurred_from?, occurred_to?, ongoing boolean, description_enc bytea, severity?: 'low'|'medium'|'high'|'critical',
                      urgency?: 'normal'|'urgent', admissible?: boolean, inadmissible_reason?, assigned_to? → users, received_at, acknowledged_at?,
                      ack_due_at, feedback_due_at?, closed_at?, outcome?: 'substantiated'|'partly_substantiated'|'not_substantiated'|'withdrawn'|'inadmissible',
                      effectiveness_review_at?, legal_hold boolean, content_hash, possible_duplicate_of? (case id), contact_erased_at?, purge_after? }
grievance_messages  { id, workspace_id, case_id, author: 'reporter'|'handler', author_user_id?, body_enc, file_ids uuid[] (→ files), visible_to_reporter boolean, created_at }
grievance_supplier_links { id, workspace_id, case_id, supplier_id (uuid, no FK), site_id? (uuid), linked_by, created_at }
grievance_measures  { id, workspace_id, case_id, kind: 'preventive'|'remedial', description_enc, due_at?, status: 'planned'|'done'|'cancelled',
                      corrective_action_ref? (uuid, set from corrective-actions event), created_by }
grievance_conflicts { id, workspace_id, case_id, user_id, declared_at }      -- excluded handlers per case
grievance_intake_tokens -- none: form tokens are stateless HMAC-signed { channelId, issuedAt, nonce }; nonces kept in Redis for 2 h to block reuse
```

Encryption: `*_enc` columns are AES-256-GCM with a per-workspace data key wrapped by `GRIEVANCE_MASTER_KEY` (env, Zod-validated, rotated with re-wrap); decryption only in `grievance-crypto.ts` inside handler-authorised services. Logs, events, audit diffs and notifications never include decrypted fields.

## 7. Business rules & calculations

### 7.1 Case state machine (`engine/case-state.ts`, pure)

```
received → triaged → acknowledged → investigating → measures → resolved → closed
received|triaged → rejected (inadmissible / out of scope; reason required; reporter informed)
any open state → withdrawn (reporter withdraws or handler records withdrawal)
resolved → investigating (reporter disputes the outcome within 30 days)
closed → (reopen) investigating   only by a handler, reason required, before the effectiveness review date
```

- `acknowledged` requires a reporter-visible message (receipt confirmation, LkSG §8(1)); `resolved` requires an outcome and a reporter-visible message explaining it; `closed` requires `effectiveness_review_at` (default closure + 6 months) unless outcome is `inadmissible` or `withdrawn`.
- Public coarse status shown to the reporter: `received` (received, triaged) · `in_progress` (acknowledged, investigating, measures) · `answered` (resolved) · `closed` (closed, rejected, withdrawn).

### 7.2 Deadlines (`engine/deadlines.ts`, pure)

- `ack_due_at = received_at + ack_days` (calendar days, UTC end of day in the channel's time zone).
- `feedback_due_at = acknowledged_at + feedback_days` (set at acknowledgement).
- Flags: `due_soon` when `now ≥ due − 2 days` and not met; `overdue` when `now > due` and not met. Ack is met at `acknowledged_at`; feedback is met at the first reporter-visible message after acknowledgement that the handler marks "feedback" or at `resolved`.
- `grievance.overdue` is emitted once per case and deadline kind (idempotent key `caseId:kind`).

### 7.3 Anti-abuse

- Form token: `GET /public/grievances/:slug/form` returns `formToken = base64url(HMAC-SHA256(key, channelId|issuedAt|nonce))`; submit valid when `4 s ≤ now − issuedAt ≤ 2 h` and the nonce is unused.
- Rate limits (`RateLimiter`): submit 5/hour and 20/day per (channel, IP hash); follow-up login 5 per 15 min per reference and 30/hour per IP hash; uploads 10/hour per form token.
- IP hash = SHA-256(ip ‖ daily salt); salts rotate daily and are deleted after 30 days, so hashes cannot be linked across months.
- Duplicate: `content_hash` = SHA-256 of the normalised description (lower-case, collapsed whitespace). A match in the same channel within 30 days never merges or reveals anything to the reporter: the new case is created normally and gets `possible_duplicate_of` (visible to handlers only), who may merge manually.

### 7.4 Statistics (`engine/stats.ts`, pure)

Counts by category, country, status, outcome, supplier tier (tier passed in from supplier-register read model); median days to acknowledge and to close; share acknowledged within deadline. Any cell with count 1–2 is shown as "< 3"; computed server-side only.

### 7.5 Retention (`grievance-retention` processor, daily)

- `contact_erased_at` set and `reporter_contact_enc` nulled when `closed_at + contactMonths` has passed.
- Case, messages, measures and attachment files deleted when `closed_at + caseYears` has passed and `legal_hold = false`; an audit event `grievance.purged` keeps only reference, category and dates.

## 8. API contract (REST `/v1`)

Authenticated:

| Route                                                                                                  | Permission                                |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| `GET/POST /grievance-channels` · `GET/PATCH /grievance-channels/:id`                                     | `grievance:configure`                     |
| `GET/POST /grievance-handlers` · `DELETE /grievance-handlers/:id`                                        | `grievance:configure`                     |
| `GET /grievances?status=&category=&overdue=&supplierId=&cursor=`                                         | `grievance:handle` (appointed)            |
| `GET /grievances/:id` · `PATCH /grievances/:id` `{ category, severity, urgency, assignedTo, admissible }` | `grievance:handle` (appointed, not conflicted) |
| `POST /grievances/:id/transition` `{ to, reason?, outcome?, effectivenessReviewAt? }`                    | `grievance:handle`                        |
| `GET/POST /grievances/:id/messages` `{ body, visibleToReporter, isFeedback?, fileIds? }`                  | `grievance:handle`                        |
| `POST/DELETE /grievances/:id/suppliers` `{ supplierId, siteId? }`                                         | `grievance:handle`                        |
| `GET/POST/PATCH /grievances/:id/measures[/:mid]`                                                          | `grievance:handle`                        |
| `POST /grievances/:id/conflicts` (declare own conflict) · `POST /grievances/:id/legal-hold` `{ on }`      | `grievance:handle` / `grievance:configure` |
| `POST /grievances` (handler records hotline / email / in-person intake)                                   | `grievance:handle`                        |
| `GET /grievance-stats?from=&to=` · `GET /grievance-stats/export.xlsx`                                     | `grievance:stats` / `dd_report:export`    |
| `GET /suppliers/:sid/grievance-summary` (counts by status and severity, no content)                       | `grievance:stats`                         |

Public (`@Public()`, rate-limited, no auth header, no cookies):

| Route                                                  | Notes                                                                    |
| ------------------------------------------------------ | ------------------------------------------------------------------------ |
| `GET /public/grievances/:slug/form?lang=`              | channel intro, categories, languages, branding, `formToken`; `404` when unknown or paused |
| `POST /public/grievances/:slug/uploads`                 | upload intent via `files` (purpose `grievance_attachment`), needs `formToken` |
| `POST /public/grievances/:slug/reports`                 | `201 { reference, accessCode }`                                          |
| `POST /public/grievances/follow-up/session` `{ reference, accessCode }` | `200 { followUpToken }` (opaque, 30 min, memory only on the client); generic `400` on mismatch |
| `GET /public/grievances/follow-up` · `POST /public/grievances/follow-up/messages` · `POST …/withdraw` | header `X-Follow-Up-Token`                    |

Errors: `validation_failed`, `rate_limited`, `not_found`, `invalid_state_transition`, `entitlement_required`, `payload_too_large`.

## 9. UI

Buyer (app shell, Due diligence group, nav "Grievances" last in the group; visible with `grievance:handle` or `grievance:configure` or `grievance:stats`, module `due_diligence`; locked-module panel otherwise):

- `/grievances` — case list page (02 §5): reference, received, category, country, linked supplier, severity chip (label + icon), status pill, deadline chip ("Ack due in 2 days" / "Overdue", icon + text); filter chips status, category, overdue, supplier; empty state explains the channel and offers "Set up your reporting channel" (configure) or "No cases yet — share your channel link" (handlers); skeleton; error with retry. Handlers only.
- `/grievances/:id` — detail page (02 §5): header with reference, status pill, deadlines; tabs Overview (triage form, timeline of transitions) · Messages (thread, reporter-visible vs internal clearly marked, compose with "visible to reporter" switch off by default) · Suppliers (link from register combobox) · Measures · Activity; transition actions in the page header (one primary). Content renders as plain text (no HTML).
- `/grievances/insights` — statistics (02 §9.5 dashboard pattern): `StatTile`s (open cases, acknowledged on time %, median days to close, substantiated %), cases by category (`BarChart` via `ResiliChart`, fixed category order from reference data, "View as table"), cases by country (table). Visible with `grievance:stats`.
- Supplier detail tab "Grievances" `/suppliers/:sid/grievances` (`grievance:stats`): counts by status and severity from `GET /suppliers/:sid/grievance-summary`, link to the filtered case list for handlers; exported as `supplierGrievancesTabRoute` and composed by the router into M19 `supplierDetailRoute(extraTabs)`.
- `/grievances/settings` — channel configuration (link + QR + copy button, languages, intro texts, categories, deadlines, retention), handlers list (appoint / revoke).

Public (public minimal shell, `https://survey.resilisense.org/report/:slug`, M08 public entry):

- Intake: buyer/company logo, language switch, plain-language intro, protection notice, form in one column with `body-lg`, "Stay anonymous" switch (on), optional contact, attachments, review and submit; receipt page shows reference and access code with copy and "I have saved my code" confirmation, and warns the code cannot be recovered.
- Follow-up: `/report/:slug/follow-up` reference + code, then coarse status, messages and "Add information".
- Works at 360 px, RTL, keyboard only, 200 % zoom; no third-party scripts, no analytics, no cookies on public pages.

Motion (Calm Ledger): one entrance per view (`--motion-enter` rows, `--motion-grow` bars, `--motion-count` tiles); public pages use no motion beyond `--motion-hover`; reduced motion renders final values.

## 10. Events, notifications & audit

Emits (constants in `events.ts`; payloads carry no reporter data or free text):

- `grievance.received` `{ workspaceId, caseId, reference, channelId, categoryCode, countryCode?, source, receivedAt }`
- `grievance.supplier_linked` `{ workspaceId, caseId, supplierId, categoryCode, severity? }` (`low|medium|high|critical`) — monitoring (M24) signal; risk (M22) does not use grievances in `risk-1`
- `grievance.status_changed` `{ workspaceId, caseId, from, to, outcome? }`
- `grievance.substantiated` `{ workspaceId, caseId, supplierIds, categoryCode, severity }` — corrective-actions may open a CAP
- `grievance.overdue` `{ workspaceId, caseId, kind: 'acknowledgement'|'feedback', dueAt }`

Consumes: `supplier.archived` (M19; keep links, mark supplier archived in the case view), `file.scanned` (M14; hide quarantined attachments), `cap.closed` (corrective-actions; mark the linked measure done when `corrective_action_ref` matches).

Notifications: new case → all appointed handlers (in-app + email "New report GRV-… received", no content); reporter message → assigned handler; deadlines due soon / overdue → assigned handler and configurers; reporter email (only if given) "There is an update on your report" with no content. Audit: every read of a case (`grievance.viewed`), transition, message, link, measure, handler appointment, conflict, legal hold, purge — entity ids only.

## 11. Migration from legacy

None.

## 12. Test plan

- Engine: `case-state.spec.ts` (every allowed and forbidden transition, required fields), `deadlines.spec.ts` (boundaries, time zones, feedback met rules), `stats.spec.ts` (suppression < 3, medians, empty sets) + property tests (`deadlines.property.spec.ts`: due dates never before receipt; `case-state.property.spec.ts`: no path from `closed` except reopen).
- E2e: `test/grievances-public.e2e-spec.ts` (US-25-1, -2, -3: form token, honeypot, min time, rate limits, no PII stored, follow-up lockout, non-revealing errors), `test/grievances-cases.e2e-spec.ts` (US-25-4, -5: appointed vs non-appointed 404, conflict exclusion, other workspace 404, transitions 409), `test/grievances-stats.e2e-spec.ts` (US-25-6), `test/grievances-retention.e2e-spec.ts` (US-25-7, legal hold).
- Security: encrypted columns never in logs/events (log capture assertion), audit diffs without content.
- FE: public intake axe + 360 px + RTL + keyboard, receipt code copy; case detail message visibility switch; Playwright journey "report a grievance anonymously and follow up".

## 13. Open questions

1. **Retention defaults.** **Recommendation:** case record 7 years after closure (LkSG §10 documentation), reporter contact 3 months after closure, configurable per channel; confirm with the owner's counsel.
2. **Deadlines.** LkSG requires a receipt confirmation and a procedure with time frames but fixes no days. **Recommendation:** 7 days to acknowledge and 3 months to feed back (EU Whistleblower Directive figures), configurable.
3. **Duplicate handling.** **Recommendation:** never merge automatically (§7.3); handlers merge manually. Confirm that a 30-day window is right.
4. **Platform access.** **Recommendation:** no platform role can read case content, even for support; support works on configuration only.
5. **Hosting of the public form.** **Recommendation:** same public entry and host as questionnaires and surveys (`survey.resilisense.org`), path `/report/:slug`; a neutral host name (e.g. `report.resilisense.org`) is optional later.
6. **Encryption key management.** **Recommendation:** per-workspace data keys wrapped by an env master key now; a KMS-style secret store on the VPS (no AWS) when M01 key management lands.

## 14. Module contract

Filled by `/module-contract` (`06-modular-build.md` §2.1, §3). Folder: `src/modules/grievances/` · `src/features/grievances/` · Wave: 2

| | |
| --- | --- |
| Owns | Tables `grievance_channels`, `grievance_handlers`, `grievance_cases`, `grievance_messages`, `grievance_supplier_links`, `grievance_measures`, `grievance_conflicts` (all RLS). Routes `/v1/grievance-channels*`, `/v1/grievance-handlers*`, `/v1/grievances*`, `/v1/grievance-stats*`, `/v1/suppliers/:sid/grievance-summary`, `/v1/public/grievances/*`. Permissions `grievance:configure`, `grievance:handle`, `grievance:stats` (entitlement `due_diligence`). i18n namespaces `grievances` (app) and `public-grievance` (public entry). Pure engine `engine/{case-state,deadlines,stats}.ts`. Env `GRIEVANCE_MASTER_KEY`. |
| Public surface (`index.ts`) | `GrievancesModule` (app.module); `GrievanceEvents` (constants: monitoring, corrective-actions consume); `GrievanceStatsQuery.forPeriod(workspaceId, from, to)` → `GrievanceStats` (dd-reporting LkSG/CSDDD report, dashboard); `GrievanceSummaryQuery.bySupplier(workspaceId, supplierId)` → `SupplierGrievanceSummary` counts only (dd-reporting supplier profile). No content-bearing export. Frontend `index.ts`: `grievancesRoutes`, `publicGrievanceRoutes`, `supplierGrievancesTabRoute` (tab child for M19 `supplierDetailRoute(extraTabs)`, composed in the router). |
| Depends on | `identity` (`hashToken`, `decidePermission`), `workspaces` (company read model, entitlement), `audit` (`AuditService`), `reference-data` (grievance category list — fake `FakeReferenceCategories`), `files` (upload intent, scan status — fake `FakeFiles`), `notifications` (`EventBus.publish`, `OnDomainEvent`, `notify()` for handlers, `sendEmail()` for reporters who left an address — fake `FakeNotifications`), `supplier-register` (`getSupplier` to validate links and show name/tier — fake `FakeSupplierRegister`). Infra `RateLimiter`, Redis (form nonces). |
| Emits | `grievance.received`, `grievance.supplier_linked`, `grievance.status_changed`, `grievance.substantiated`, `grievance.overdue` (payloads §10, never content) |
| Consumes | `supplier.archived` → flag archived supplier on links; `file.scanned` → hide quarantined attachments; `cap.closed` → mark linked measure done |
