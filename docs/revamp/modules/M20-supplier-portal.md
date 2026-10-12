# M20 — Supplier portal (onboarding, consent & sharing)

> Status: Draft · Phase: A (wave 3) · Depends on: M19 (supplier-register), M01 (identity: token helpers, sign-up), M02 (workspaces, companies), M12 (notifications, event bus, audit) · Blocks: M21 shared answers, M14 supplier-evidence sharing, M22 residual risk from shared data, M10 §7 screening
> Split from M10 §4.1 (invite, access requests & sharing, "My customers") on 2026-10-12 (plan item SD03). Legacy code: BE `schema/mutations/company/{requestSupplier,acceptSupplier,rejectSupplier,removeSupplier,showSupplierResults,requestPartner,acceptPartner,rejectPartner}.js`, `schema/mutations/agency/{suppliers,removePartner}.js`, `mutations/supplierRequest/*`, `controllers/suppliers.js`, `models/supplierRequest.js`, `agency.partners[]`, `company.suppliers[]`, `project.supplierProperties[]` · FE `suppliers/*`, `partners/*`

## 1. Purpose

Connect a buyer's supplier record (M19) to the supplier's own ResiliSense workspace and let the **supplier** decide, per customer and reporting year, what the customer may see. A buyer invites a supplier by email; the invitee signs up (or signs in) and the link is made automatically; the buyer requests access to results for given years; the supplier grants `status_only` or `full_results`, declines or later revokes. The supplier answers once and shares with many buyers, keeps a profile every linked customer sees, and can see every view of its shared data. Terms: **My suppliers** (buyer side, M19) and **My customers** (supplier side, this module).

## 2. Users & permissions

| Side | Role (M01) | Can |
| --- | --- | --- |
| Buyer | workspace_owner, workspace_admin, partner_admin | Invite, resend, cancel invites, request and cancel access, unlink (`supplier:manage`, entitlement `due_diligence`) |
| Buyer | contributor, viewer, auditor | See link status, access per year, the supplier profile and the buyer-side access log (`supplier:read`, entitlement `due_diligence`) |
| Supplier | workspace_owner, workspace_admin | Accept invites, edit the supplier profile, grant / decline / revoke / change sharing, share proactively, unlink, read the access log (`customer:share`, **no entitlement**: answering customers is free) |
| Supplier | contributor, viewer, auditor | Read My customers and the access log (`customer:read`, no entitlement) |
| Invitee (public, token) | — | See who invites them and decline without an account |

`customer:share` and `customer:read` are new permissions to add to the M01 matrix; `supplier:read` is added by M19.

## 3. Current state (legacy)

- Registered supplier flow: buyer requests a year (`partners[].requestedYears`) → supplier accepts by picking its project for that year (`acceptSupplier` adds to `sharedProjects` and `company.suppliers[].projects`) → buyer sees results when `fullAccessToResults`/`showProjectResults`. Partner (reciprocal) requests per project. Physical-audit flag on `project.supplierProperties`.
- Unregistered supplier: `supplierRequest` email invite; the link is made only if the invitee later joins via `addUserToOrganisation` — a sign-up through the invite **does not link** (dead end).
- No revoke history, no audit of who viewed shared data; "Partners"/"Suppliers" labels are cross-wired; consent disclaimer only on the first share; email-only notifications.

## 4. Scope

### 4.1 Must have (parity + fixes)

- **Invite by email** from a supplier record: one active invite per supplier; 30-day token (M01 tenant token, stored hashed); resend rotates the token; cancel; reminders on day 7 and 21; expiry.
- **Auto-link on sign-up** (fixes the dead end): an invitee who signs up and verifies the invited address is linked to their new workspace without further steps; an existing user accepts with one click into the workspace they choose.
- **Access requests per reporting year**: buyer requests one or more years; supplier grants with a sharing level and a physical-audit flag, declines with an optional reason, or later revokes; buyer may cancel a pending request.
- **Sharing levels** `status_only` and `full_results` (§7.3), per customer and year; the supplier may lower the level at any time and raise it with a fresh consent.
- **Physical audit flag** per access row (supplier declares that the shared year's results were confirmed on site).
- **Consent dialog** before every grant or level raise, recorded with text version, level, years, user and time.
- **Every view of shared data audited** in both workspaces (`supplier_access.viewed`), visible to the supplier in the access log.
- **Revoke**: immediate; the buyer loses access to the supplier's data for that year; the buyer's own records (supplier record, notes, their own campaign data) stay.

### 4.2 New in the revamp

- **Supplier profile** (legal entity, registration, country, sector, website, size, description, public contact, sites summary) maintained by the supplier once and visible to every linked customer; buyer can apply profile changes to its register record (M19 PATCH, explicit click).
- **My customers**: requests inbox, sharing matrix (customers × years), proactive sharing to a linked customer without a request ("answer once, share with many"), access log, unlink.
- **Public invite page** in the minimal shell (`02` §3) with decline-without-account.
- In-app + email notifications to both parties (M12).

### 4.3 Out of scope

- The supplier record, sites and contacts (M19). Questionnaire answers and their reuse (M21), certificates (supplier-evidence), audits (M23), CAPs (M09): those modules decide **what** they show and call `assertCanView` here to know **whether** and at which level.
- Partner (reciprocal) requests per project: dropped; a customer that is also a supplier is simply linked in both directions.
- ISO 26000 supplier results view (legacy `SupplierGap`): stays in M10 until the gap modules (M04/M05) are rebuilt; it will use this module's access check.

## 5. User stories & acceptance criteria

- **US-20-1** As a buyer, I invite `supplier@example.com` from a supplier record, so that the supplier joins the platform.
  - AC: Given an off-platform supplier and `supplier:manage`, when I send an invite, then the supplier shows "Invited" (M19 `platform_status`), the invitee receives an email naming my company with a link valid 30 days, and a second invite while one is active answers 409 `conflict`.
- **US-20-2** As an invitee without an account, I sign up from the invite and am linked automatically.
  - AC: Given a valid invite, when I sign up with the invited address and verify it, then my new workspace is linked to the buyer ("Linked — awaiting sharing") without another click, the buyer sees "Linked" and both sides get a notification.
- **US-20-3** As an invitee with an account in several workspaces, I choose which workspace to link.
  - AC: Given I am signed in and owner/admin of two workspaces, when I open the invite, then I choose one (or create a new one) and the link is made to it; a workspace where I lack `customer:share` is not offered.
- **US-20-4** As an invitee, I decline an invite without creating an account.
  - AC: Given a valid invite, when I choose "Decline" on the public page, then the token is consumed, the buyer is notified and the supplier record returns to "Off-platform".
- **US-20-5** As a supplier, I share `status_only` for 2026 with Customer A and `full_results` with Customer B; each customer sees exactly that.
  - AC: Given both requests, when I grant them with those levels after the consent dialog, then `assertCanView` for A/2026 allows only `status_only` resources and for B/2026 allows `full_results`; a request for A's 2025 data answers 404 to A.
- **US-20-6** As a supplier, I revoke Customer B's access for 2026.
  - AC: Given a grant, when I revoke it, then B's next request for that data answers 404, B is notified, `supplier_access.revoked` is emitted and B's supplier record and notes are unchanged.
- **US-20-7** As a supplier, I see who viewed my shared data.
  - AC: Given buyer users opened my results twice, then the access log lists two entries with customer, user name, resource, year, level and time, newest first, and the buyer's auditor sees the same views in the buyer workspace.
- **US-20-8** As a supplier, I proactively share 2026 with a linked customer that has not asked.
  - AC: Given a linked customer and no request for 2026, when I share with a level after consent, then a granted access row exists and the customer is notified.
- **US-20-9** As a buyer, I request access for 2025 and 2026 and later cancel the 2025 request.
  - AC: Given a linked supplier, when I request two years, then two `requested` rows exist and the supplier's admins are notified; cancelling 2025 sets it to `cancelled`; requesting a year already `requested` or `granted` answers 409 `conflict`.
- **US-20-10** As a supplier, I keep a profile that all my customers see.
  - AC: Given two linked customers, when I update my profile, then both see the new values, unlinked or invited-only buyers get 404 for it, and each buyer sees a "Profile updated — review changes" notice on the supplier record.
- **US-20-11** As either side, I unlink.
  - AC: Given a link with grants, when either side unlinks, then all grants become `revoked`, pending requests `cancelled`, the supplier record returns to "Off-platform", and both sides are notified.
- **US-20-12** As a member of an unrelated workspace, I can never read a link or access row.
  - AC: Given a link between A (buyer) and B (supplier), any portal route called in workspace C with its ids answers 404; RLS returns no rows to C.

## 6. Domain model

```ts
supplier_links {
  id uuid, workspace_id (buyer) → workspaces, supplier_id uuid (M19 record, same workspace; no FK: another module's table),
  buyer_company_id → companies, supplier_workspace_id? → workspaces, supplier_company_id? → companies,
  status: 'invited'|'linked'|'unlinked'|'invite_expired'|'invite_cancelled'|'invite_declined',
  invite_email?, invite_email_hash?, invite_token_hash?, invite_locale?, invite_message?, invite_expires_at?,
  invited_by? → users, invited_at?, reminders_sent smallint,
  linked_at?, linked_by? → users, unlinked_at?, unlinked_by? → users, unlinked_side?: 'buyer'|'supplier',
  supplier_display_name?, buyer_display_name                                      // snapshots, refreshed on profile/company change
}
unique (workspace_id, supplier_id) where status in ('invited','linked')
unique (workspace_id, supplier_workspace_id, buyer_company_id) where status = 'linked'

supplier_access {
  id, workspace_id (buyer), link_id → supplier_links, supplier_workspace_id → workspaces, reporting_year smallint,
  status: 'requested'|'granted'|'declined'|'revoked'|'cancelled', level?: 'status_only'|'full_results',
  physical_audit boolean default false, request_message?, decline_reason?,
  requested_by? → users, requested_at?, decided_by? → users, decided_at?, revoked_by? → users, revoked_at?,
  consent_id? → supplier_consents
}
unique (link_id, reporting_year)

supplier_consents {                                                                 // append-only consent evidence
  id, workspace_id (supplier), buyer_workspace_id, link_id, access_ids uuid[], level, years smallint[], physical_audit,
  text_version, text_hash, locale, given_by → users, given_at, ip_hash?
}

supplier_profiles {
  id, workspace_id (supplier) unique per company, company_id → companies, legal_name, trading_name?, registration_number?,
  vat_id?, country_code → countries, sector_code? → sectors, website?, employees_band?, description? (≤ 2,000),
  public_contact_email?, sites jsonb [{ name, countryCode, city?, activity? }] (≤ 50), version int
}
```

**RLS.**

- `supplier_links`, `supplier_access`: `USING (workspace_id = app_current_workspace() OR supplier_workspace_id = app_current_workspace())`; `INSERT WITH CHECK (workspace_id = app_current_workspace())` (only the buyer creates rows). Which side may change which columns is enforced in the service (§7.1–7.2) and by trigger `supplier_access_side_guard` (planned) that rejects a buyer-side change of decision columns and a supplier-side change of request columns.
- `supplier_consents`: insert by the supplier workspace; select where `workspace_id = current OR buyer_workspace_id = current`; no update/delete policy.
- `supplier_profiles`: own workspace read/write; buyers read where `EXISTS (SELECT 1 FROM supplier_links l WHERE l.supplier_workspace_id = supplier_profiles.workspace_id AND l.supplier_company_id = supplier_profiles.company_id AND l.workspace_id = app_current_workspace() AND l.status = 'linked')` (only this module's tables).
- Invite lookups before a link exists: by token, the token encodes the buyer workspace (`encodeTenantToken`), so the lookup runs in `withTenant(buyerWorkspaceId)`. By verified email (`GET /me/supplier-invites`, auto-link): SQL function `supplier_pending_invites(email_hash bytea)` `SECURITY DEFINER`, returning only `id, workspace_id, buyer_display_name, invite_expires_at`, called by one explicit, audited repository method. RLS is never disabled.

## 7. Business rules & calculations

### 7.1 Link state machine

| From | Action (side) | To | Effects |
| --- | --- | --- | --- |
| — / `invite_*` / `unlinked` | invite (buyer) | `invited` | token + hash, email via M12, `supplier.invited` |
| `invited` | resend (buyer) | `invited` | new token (old one dead), `reminders_sent = 0`, max 3 resends / 24 h |
| `invited` | accept (invitee, signed in) or auto-link (§7.2) | `linked` | `supplier_workspace_id`, `supplier_company_id` (auto when the workspace has one company, else chosen at first grant), `supplier.linked` |
| `invited` | decline (public token) | `invite_declined` | `supplier.invite.declined` |
| `invited` | cancel (buyer) | `invite_cancelled` | `supplier.invite.cancelled` |
| `invited` | 30 days pass (worker) | `invite_expired` | `supplier.invite.expired` |
| `linked` | unlink (either) | `unlinked` | grants → `revoked`, requests → `cancelled`, `supplier.unlinked` |

Any other transition answers 409 `invalid_state_transition`. A supplier record archived in M19 (`supplier.archived`) cancels an `invited` link and pending requests; `linked` stays (the supplier's consent is theirs) but no new request can be made until restore.

### 7.2 Auto-link

- Trigger: `user.email.verified` (M01, via the M12 bus) for an email whose hash matches one or more `invited` links with a live token.
- Rule: if the user is `workspace_owner` of **exactly one** workspace and that workspace is not the buyer's, link every matching invite to it; otherwise leave the invites pending and list them in `GET /me/supplier-invites` and on the invite page for the user to choose. The auto-link is audited as actor `system` with the user as subject.
- Signed-in acceptance (`POST /supplier-invites/:token/accept`) links to the caller's **current** workspace; the caller needs `customer:share` there. The invited address and the accepting user's address may differ (forwarded invites); the buyer sees "linked by user@domain" (§13 Q2).
- A workspace can never link to itself (buyer = supplier workspace answers 409).

### 7.3 Access and sharing levels

Access row states: `requested → granted | declined | cancelled`; `granted → revoked`; `granted → granted` (level change); `declined | revoked | cancelled → requested` (buyer re-requests; after a decline at most once per 30 days → 429 `rate_limited`). Proactive share creates `granted` directly. Years allowed: `currentYear − 5 … currentYear + 1`.

| Resource (owning module) | `status_only` | `full_results` |
| --- | --- | --- |
| Supplier profile (M20) | ✔ (any `linked` buyer, no grant needed) | ✔ |
| Questionnaire status: completion %, submitted date, overall score (M21) | ✔ | ✔ |
| Questionnaire answers, section/question scores, comments (M21) | — | ✔ |
| Certificates: type, issuer, validity status and expiry (supplier-evidence) | ✔ | ✔ |
| Documents and certificate files (download) (supplier-evidence) | — | ✔ |
| Audit summary: date, type, overall result; findings and CAP details (M23, M09) | summary | ✔ |
| ISO 26000 overall verified score + verified/self-assessed badge (M05) | ✔ | ✔ |
| ISO 26000 core subject/issue scores + documentation assessment summary (M05) | — | ✔ |
| Physical audit flag (M20) | ✔ | ✔ |

- `accessFor(buyerWorkspaceId, supplierId, year)` returns the effective level: `none` unless the link is `linked` and the row for that year is `granted`.
- `assertCanView(ctx, { supplierId, year, required, resource })` throws `ProblemError('not_found')` when the level is below `required` (never 403, so the existence of data is not revealed) and otherwise records the view (§7.4).
- Raising `status_only → full_results` needs a new consent; lowering needs none. Level changes and revocations take effect on the next request (no caching of access decisions beyond the request).
- Revocation never deletes the buyer's own records (M19 supplier, notes, the buyer's campaign definitions); data derived by the buyer's engines from shared data (e.g. M22 residual risk) is recomputed without it when they consume `supplier_access.revoked`.

### 7.4 View audit

Each `assertCanView` success writes `supplier_access.viewed` twice through `AuditService.record` in the caller's transaction: once with `workspace_id = buyer` and once with `workspace_id = supplier`, both with `{ accessId, linkId, year, level, resource: { module, type, id? }, viewerId }`. A list or report covering many suppliers records one event per supplier per request, not per row rendered. Exports (`dd-reporting`) record `supplier_access.exported`.

### 7.5 Consent

- Text versions are content (`supplier-sharing-v1`, translated in M15); the dialog must show the version the server expects (`GET /customers/consent-text?level=`); a grant with an older `consentVersion` answers 409 `conflict`.
- The consent records customer, years, level, physical audit flag, text version + SHA-256 of the rendered text, locale, user, time and IP hash; it is append-only and visible to both sides.

## 8. API contract (REST `/v1`)

Buyer routes need entitlement `due_diligence`; supplier routes need no entitlement. Ids of links/access rows the current workspace is not party to answer 404.

| Route | Permission |
| --- | --- |
| `POST /suppliers/:id/invite` `{ email?, locale?, message? }` (defaults to the M19 primary contact) → 202 (`Idempotency-Key`) | `supplier:manage` |
| `POST /suppliers/invites:bulk` `{ supplierIds[≤500], locale?, message? }` → 202 job (`Idempotency-Key`) | `supplier:manage` |
| `POST /suppliers/:id/invite/resend` · `POST /suppliers/:id/invite/cancel` | `supplier:manage` |
| `GET /suppliers/:id/link` (link, access rows by year, consents, profile when linked; view audited) | `supplier:read` |
| `GET /supplier-links?status=&companyId=&cursor=` | `supplier:read` |
| `POST /suppliers/:id/access-requests` `{ years[], message? }` (`Idempotency-Key`) · `POST /supplier-access/:accessId/cancel` | `supplier:manage` |
| `POST /suppliers/:id/unlink` | `supplier:manage` |
| `GET /suppliers/:id/access-log?cursor=` (buyer-side views) | `supplier:read` |
| `GET /customers?cursor=` (links where I am the supplier, with access rows) · `GET /customers/:linkId` | `customer:read` |
| `GET /customers/requests?status=requested` | `customer:read` |
| `GET /customers/consent-text?level=&locale=` | `customer:read` |
| `POST /supplier-access/:accessId/grant` `{ level, physicalAudit, companyId?, consentVersion, confirm: true }` | `customer:share` |
| `POST /supplier-access/:accessId/decline` `{ reason? }` · `POST /supplier-access/:accessId/revoke` · `PATCH /supplier-access/:accessId` `{ level, physicalAudit, consentVersion? }` | `customer:share` |
| `POST /customers/:linkId/shares` `{ years[], level, physicalAudit, consentVersion, confirm: true }` | `customer:share` |
| `POST /customers/:linkId/unlink` | `customer:share` |
| `GET /customers/access-log?linkId=&from=&to=&cursor=` | `customer:read` |
| `GET /supplier-profile` · `PUT /supplier-profile` `{ …, version }` | read `customer:read`, write `customer:share` |
| `GET /me/supplier-invites` (pending invites for my verified email) | `@Authenticated()` |
| `POST /supplier-invites/:token/accept` `{ companyId? }` (links to the current workspace) | `customer:share` |
| `GET /public/supplier-invites/:token` (buyer display name + logo, masked email, expiry, status) | `@Public()`, rate-limited per IP |
| `POST /public/supplier-invites/:token/decline` `{ reason? }` | `@Public()`, rate-limited per IP |

Errors: 400 `validation_failed`, 400 `invalid_token` (unknown, expired or used token; one message for all), 403 `forbidden`/`entitlement_required`, 404 `not_found`, 409 `conflict` (duplicate invite/request, stale consent version, self-link), 409 `invalid_state_transition`, 429 `rate_limited`.

## 9. UI

Namespace `supplier-portal`. Calm Ledger (`02` §9): one entrance per view (`--motion-enter` for cards and rows), no other motion; reduced motion renders final state.

- **Buyer — Sharing tab** `/suppliers/:id/sharing` (route child of the M19 supplier detail, `supplier:read`): link card by status — Off-platform: explanation + "Invite to portal" (`InviteDialog`: email prefilled with the primary contact, language, optional message, preview of the email subject); Invited: sent date, expiry, reminders, "Resend", "Cancel invite"; Linked: supplier workspace name, linked since, linked by, profile summary with "Apply profile changes" when it differs from the register (diff list, applies via M19 PATCH); Declined/Expired: reason + "Invite again". Below: access table (year, status pill, level badge, physical audit, requested/decided dates, actions Request / Cancel) and "Request access" (`RequestAccessDialog`, years multi-select). Access log section (buyer-side views). Loading: card + table skeleton; empty access table explains requests and offers "Request access"; error: retry.
- **Buyer — Invitations** `/suppliers/invite?ids=` (from the register bulk bar, `supplier:manage`): review list of selected suppliers with resolved primary contact emails, rows without email flagged, "Send n invites" → bulk job, result summary.
- **Supplier — My customers** `/customers` (nav "My customers", Due diligence group, `customer:read`, no module; shown when the workspace has at least one link or pending invite): URL-synced tabs **Requests** (cards: customer, years, message, Grant / Decline) · **Sharing** (matrix customers × years; cell = level badge or "—"; cell menu: change level, revoke, share; keyboard grid navigation with arrow keys, `role="grid"`) · **Access log** (`DataTable`: time, customer, user, resource, year, level; filters customer/date) · **Profile** (form, `customer:share` to edit). Empty Requests: "No requests yet — customers who invite you will appear here". Loading skeletons per tab; error with retry.
- **`ConsentDialog`**: customer name and logo, years, chosen level with an "Included / Not included" list generated from §7.3, physical audit checkbox, the consent text of the server's version, required checkbox "I am authorised to share this on behalf of <company>"; primary button disabled until checked; focus trapped, Esc cancels, returns focus to the trigger.
- **Public invite page** `/supplier-invite/:token` (minimal shell `02` §3: logo, buyer company logo, language switch, no sidebar; works at 360 px, RTL): states valid (who invites, what linking means, "nothing is shared until you choose", buttons Create account → `/sign-up?email=&returnTo=`, Sign in → `/sign-in` with return state, Decline), invalid/expired (one message, no detail), already linked. When signed in: choose workspace (owner/admin ones) or create one, then Accept → `/customers`.
- **Pending invites banner** (mounted by the shell from this feature's `index.ts`): signed-in users with `GET /me/supplier-invites` results see "Acme invited you to share sustainability data — Review".

## 10. Events, notifications & audit

Exported as `SupplierPortalEvents` from `src/modules/supplier-portal/events.ts`.

| Event | Payload | Notification (M12) |
| --- | --- | --- |
| `supplier.invited` | `{ workspaceId, supplierId, linkId, at }` | email to the invitee (buyer branding, "<Company> via ResiliSense") |
| `supplier.invite.reminded` | `{ workspaceId, linkId, n }` | email reminder (day 7, 21) |
| `supplier.invite.declined` · `.cancelled` · `.expired` | `{ workspaceId, supplierId, linkId }` | in-app to the inviter (declined, expired) |
| `supplier.linked` | `{ workspaceId, supplierId, linkId, supplierWorkspaceId, auto }` | in-app + email to inviter and supplier admins |
| `supplier.unlinked` | `{ workspaceId, supplierId, linkId, supplierWorkspaceId, side }` | in-app + email to the other side |
| `supplier_access.requested` | `{ accessId, workspaceId, supplierId, supplierWorkspaceId, year }` | in-app + email to supplier `customer:share` holders; reminder after 7 days |
| `supplier_access.granted` · `.level_changed` | `{ …, level, physicalAudit }` | in-app + email to the requester and buyer admins |
| `supplier_access.declined` · `.revoked` · `.cancelled` | `{ accessId, workspaceId, supplierId, supplierWorkspaceId, year }` | in-app + email to the other side |
| `supplier_profile.updated` | `{ supplierWorkspaceId, companyId, changed[] }` | in-app to linked buyers' `supplier:manage` holders |
| `supplier_access.viewed` · `.exported` | audit only (§7.4) | — |

Consumes: `user.email.verified` (M01 via bus) → auto-link (§7.2); `supplier.archived` (M19) → cancel invite and pending requests; `company.deleted` / `workspace.suspended|deleted` (M02) → unlink links of that supplier workspace/company. Audit: every state change of links, access rows and consents, profile updates, every view and export.

## 11. Migration from legacy

- `agency.partners[] { company, sharedProjects, showProjectResults, requestedYears, partnerRequestedProjects }` + `company.suppliers[] { agency, projects[] }` → `supplier_links(status='linked')` and per year: `requestedYears` → `supplier_access(status='requested')`; shared projects → `supplier_access(status='granted', level = showProjectResults || fullAccessToResults ? 'full_results' : 'status_only')`, consent recorded as `text_version='legacy'`.
- `supplierRequest` → `supplier_links(status='invite_expired')` (tokens not migrated; buyers re-send).
- `project.supplierProperties.physicalAudit` → `supplier_access.physical_audit` of the matching year.
- Partner (reciprocal) requests → links in both directions where both sides had accepted; open ones dropped and reported.

## 12. Test plan

- Unit: link and access state machines (`engine/link-state.ts`, `engine/access-state.ts`: every allowed and rejected transition), level coverage table (`engine/levels.ts`: `covers(granted, required)`), auto-link rule (`engine/auto-link.ts`), property tests that no sequence of actions yields `granted` without a consent id.
- E2e (`test/supplier-portal-*.e2e-spec.ts`): invite → public page → decline; invite → sign-up → verify → auto-linked; accept into chosen workspace; request → grant (`status_only` / `full_results`) → `assertCanView` per resource → revoke → 404; cross-workspace RLS from buyer, supplier and an unrelated workspace (`test/tenancy-rls.e2e-spec.ts` cases for all four tables); side guard (buyer cannot grant, supplier cannot request); view audit rows in both workspaces; public routes rate-limited; supplier routes work without the `due_diligence` entitlement.
- Frontend: MSW page tests for Sharing tab, My customers tabs, invite page states; `ConsentDialog` keyboard + screen-reader test; Playwright `e2e/supplier-portal.spec.ts` (invite → accept → request → grant → revoke) with axe.

## 13. Open questions

1. **Profile visibility without a grant.** Linking alone lets every linked buyer see the supplier profile. _Recommended: yes — the profile is business contact data the supplier writes for customers; results always need a grant._
2. **Forwarded invites.** Accept with a signed-in address different from the invited one? _Recommended: allow (sustainability and procurement contacts differ), show "linked by user@domain" to the buyer and let either side unlink._
3. **Physical audit flag meaning.** Supplier-declared "an on-site audit confirmed these results" vs buyer-requested on-site audit. _Recommended: supplier-declared flag here; buyer-planned audits live in `dd-audits` (M23)._
4. **Supplier plan.** Suppliers answering customers need no paid entitlement; should a workspace created through an invite get a dedicated free `supplier` plan instead of the trial? _Recommended: yes — M02 adds plan `supplier` (no paid modules, no expiry), applied on auto-link of a fresh trial workspace._
5. **Invite TTL and reminders.** _Recommended: 30 days, reminders day 7 and 21, max 3 resends per 24 h per supplier._
6. **Accept page in the main app or the M08 public entry?** _Recommended: main app public route with the minimal shell, because it hands over to sign-up/sign-in and the session; the M08 survey entry stays session-less._

## 14. Module contract

Filled by `/module-contract` (`06-modular-build.md` §2.1, §3). Folder: `src/modules/supplier-portal/` · `src/features/supplier-portal/` · Wave: 3

| | |
| --- | --- |
| Owns | Tables `supplier_links`, `supplier_access`, `supplier_consents`, `supplier_profiles` (cross-workspace RLS §6, SQL function `supplier_pending_invites`); routes `/v1/suppliers/:id/{invite,link,access-requests,unlink,access-log}*`, `/v1/suppliers/invites:bulk`, `/v1/supplier-links`, `/v1/supplier-access/*`, `/v1/customers*`, `/v1/supplier-profile`, `/v1/me/supplier-invites`, `/v1/supplier-invites/:token/accept`, `/v1/public/supplier-invites/*`; permissions `customer:share`, `customer:read` (new; buyer side uses M19's `supplier:read`/`supplier:manage`); BullMQ jobs `supplier-invite-bulk`, `supplier-invite-reminders`, `supplier-invite-expiry`, `supplier-access-request-reminders`; i18n namespace `supplier-portal`; FE routes `/suppliers/:id/sharing`, `/suppliers/invite`, `/customers/*`, `/supplier-invite/:token` (public) |
| Public surface (`index.ts`) | `SupplierPortalModule`; `SupplierAccessService.accessFor(buyerWorkspaceId, supplierId, year)` → `{ level: 'none'\|'status_only'\|'full_results', physicalAudit, accessId?, supplierWorkspaceId? }` (screening, risk, questionnaires, supplier-evidence, dd-reporting, M05 supplier results); `SupplierAccessService.assertCanView(ctx, { supplierId, year, required, resource })` (every module that shows shared supplier data: checks and audits the view); `SupplierAccessService.linkOf(buyerWorkspaceId, supplierId)` → `SupplierLinkReadModel \| null` and `customersOf(supplierWorkspaceId)` → `CustomerLinkReadModel[]` (wave-4 increments: M21 shared answers, supplier-evidence document library — M21 and M14 use only this module's events today); `SupplierPortalEvents`; types `SharingLevel`, `AccessDecision`, `SupplierLinkReadModel`, `CustomerLinkReadModel`. FE `index.ts`: `supplierPortalRoutes`, `supplierPublicRoutes` (invite page), `supplierSharingTabRoute` (tab child for M19 `supplierDetailRoute(extraTabs)`, composed in the router), `PendingSupplierInvitesBanner` (mounted by the shell). `SharingLevelBadge` stays feature-private: questionnaires (wave 2) must not import this wave-3 feature, so a feature that needs the badge gets a generic level badge in `src/components/ui` instead |
| Depends on | `supplier-register` (`getSupplier`, `primaryContact`; the register's `platform_status` follows this module's events, no direct call; fake `__tests__/fakes/supplier-register.fake.ts`), `identity` (`encodeTenantToken`, `hashToken`, `TTL`, `emailField`, planned export `decodeTenantToken`; real), `workspaces` (company read model for display names and logos, planned export; fake `workspaces.fake.ts`), `notifications` (`EventBus.publish`, `OnDomainEvent`, `notify()` for members, `sendEmail()` for invitees, `emailStatuses()` for bounced invites; fake `notifications.fake.ts`), `audit` (`AuditService`, real) |
| Emits | `supplier.invited`, `supplier.invite.reminded`, `supplier.invite.declined`, `supplier.invite.cancelled`, `supplier.invite.expired`, `supplier.linked`, `supplier.unlinked`, `supplier_access.requested`, `supplier_access.granted`, `supplier_access.level_changed`, `supplier_access.declined`, `supplier_access.revoked`, `supplier_access.cancelled`, `supplier_profile.updated` (payloads §10); audit-only `supplier_access.viewed`, `supplier_access.exported` |
| Consumes | `user.email.verified` (identity, via bus) → auto-link §7.2; `supplier.archived` (supplier-register) → cancel invite and pending requests; `company.deleted`, `workspace.suspended`, `workspace.deleted` (workspaces) → unlink affected links |
