# Supplier portal (M20 · SD03)

> Spec: `docs/revamp/modules/M20-supplier-portal.md` · Status: Draft · Wave: 3

## Purpose

Connects a buyer's supplier record to the supplier's own workspace and lets the supplier decide what each customer sees: email invites with auto-link on sign-up, access requests per reporting year, sharing levels `status_only` / `full_results`, revoke, the physical audit flag, consent records, the supplier profile and an audit of every view of shared data. It is the only module whose tables are read from two workspaces.

## Owns

- Tables (M20 §6): `supplier_links`, `supplier_access`, `supplier_consents`, `supplier_profiles`. Migration `<ts>_rls_supplier_portal_tables` with the **cross-workspace** policies of M20 §6 (`workspace_id = app_current_workspace() OR supplier_workspace_id = app_current_workspace()`, insert only by the buyer; consents insert by the supplier; profiles readable by linked buyers via `EXISTS` on `supplier_links`), trigger `supplier_access_side_guard` and the `SECURITY DEFINER` function `supplier_pending_invites(email_hash)`. FKs only to `workspaces`, `companies`, `users` and inside the module; `supplier_id` is a plain uuid (M19 record).
- Routes (M20 §8): buyer `/v1/suppliers/:id/{invite,invite/resend,invite/cancel,link,access-requests,unlink,access-log}`, `/v1/suppliers/invites:bulk`, `/v1/supplier-links`, `/v1/supplier-access/:id/cancel`; supplier `/v1/customers*`, `/v1/supplier-access/:id/{grant,decline,revoke}`, `PATCH /v1/supplier-access/:id`, `/v1/supplier-profile`; user `/v1/me/supplier-invites`, `/v1/supplier-invites/:token/accept`; public `/v1/public/supplier-invites/:token{,/decline}` (`@Public()`, rate-limited per IP).
- Permissions: buyer side uses `supplier:read` / `supplier:manage` (entitlement `due_diligence`); supplier side `customer:read`, `customer:share` (new, owner/admin get both, contributor/viewer/auditor get `customer:read`; **no entitlement** in `PERMISSION_MODULE`).
- BullMQ jobs: `supplier-invite-bulk`, repeatable `supplier-invite-reminders` (day 7, 21), `supplier-invite-expiry` (day 30), `supplier-access-request-reminders` (day 7).

## Public surface (`index.ts`)

| Export (all planned)                                                                                             | Why others need it                                                                             |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `SupplierPortalModule`                                                                                           | `app.module.ts`; modules that inject the access service                                        |
| `SupplierAccessService.accessFor(buyerWid, supplierId, year)` → `AccessDecision`                                 | screening, risk, questionnaires, supplier-evidence, dd-reporting decide what they may use      |
| `SupplierAccessService.assertCanView(ctx, { supplierId, year, required, resource }, tx?)`                        | every module that shows shared supplier data: 404 below the level, else audits the view (§7.4) |
| `linkOf(buyerWid, supplierId)`, `customersOf(supplierWid)`                                                       | wave-4 increments (M21 shared answers, evidence library); today M21/M14 use only events        |
| `SupplierPortalEvents`, types `SharingLevel`, `AccessDecision`, `SupplierLinkReadModel`, `CustomerLinkReadModel` | Event names and read models                                                                    |

`AccessDecision = { level: 'none' | 'status_only' | 'full_results', physicalAudit, accessId?, supplierWorkspaceId? }`. Decisions are never cached beyond one request.

## Depends on

- `supplier-register`: `getSupplier`, `primaryContact` — fake `__tests__/fakes/supplier-register.fake.ts`. The register's `platform_status` follows this module's events (`supplier.invited|linked|unlinked|invite.*`); no direct call.
- `identity`: `encodeTenantToken`, `hashToken`, `TTL`, `emailField` (real) and `decodeTenantToken` (**planned export**, add to `identity/index.ts` with a card line).
- `workspaces`: company read model (display name, logo file id) and entitlement check — planned exports; fake `__tests__/fakes/workspaces.fake.ts`.
- `notifications` (M12 §14): `notify()` (in-app + email to workspace members), `sendEmail()` (invitee addresses that are not users yet), `emailStatuses()` (bounced invites), `EventBus.publish` + `@OnDomainEvent` — fake `__tests__/fakes/notifications.fake.ts`.
- `audit`: `AuditService` (real) — view events are written in **both** workspaces.

## Events

- Emits (M20 §10): `supplier.invited`, `supplier.invite.reminded|declined|cancelled|expired`, `supplier.linked`, `supplier.unlinked`, `supplier_access.requested|granted|level_changed|declined|revoked|cancelled`, `supplier_profile.updated`; audit-only `supplier_access.viewed`, `supplier_access.exported`.
- Consumes: `user.email.verified` (identity, via the M12 bus; identity must publish it) → auto-link (§7.2); `supplier.archived` → cancel invite and pending requests; `company.deleted`, `workspace.suspended|deleted` → unlink links of that supplier workspace/company.

## Components & behaviour

- `invites.service.ts` (planned) — invite (one active invite per supplier → 409), token = `encodeTenantToken(buyerWid, random32)`, stored as `hashToken`, 30-day expiry; resend rotates (max 3 / 24 h → 429); cancel; public lookup by token runs in `withTenant(decoded buyer wid)`; public decline consumes the token; one `invalid_token` answer for unknown/expired/used tokens. Invite emails through `sendEmail()` (`senderName` = buyer company, `idempotencyKey` from the request), in-app notices through `notify()`.
- `linking.service.ts` (planned) — `accept(token)` links to the caller's current workspace (`customer:share` required, self-link → 409); `autoLink(userId, emailHash)` on `user.email.verified`: links when the user owns exactly one workspace that is not the buyer's (`engine/auto-link.ts`), else leaves invites for `GET /me/supplier-invites` (served by the audited `supplier_pending_invites` lookup). Unlink from either side revokes grants and cancels requests in one transaction.
- `access.service.ts` (planned) — request (years `current−5…current+1`, duplicate → 409, re-request after decline once per 30 days), cancel, grant / proactive share (consent required: current `text_version`, `confirm: true`, writes `supplier_consents`), decline, revoke, level change (raise needs a new consent). All transitions through `engine/access-state.ts`; anything else → 409 `invalid_state_transition`.
- `access-check.service.ts` (planned) — `accessFor` / `assertCanView` (level coverage from `engine/levels.ts`), writes `supplier_access.viewed` for buyer and supplier workspaces in the caller's transaction.
- `profile.service.ts` (planned) — supplier profile CRUD with `version`; emits `supplier_profile.updated` with `changed[]`.
- Repositories (planned): `links.repository.ts`, `access.repository.ts`, `profiles.repository.ts` — the only Prisma access; cross-workspace reads only through these explicit methods, each audited; RLS never disabled.
- `engine/` (planned, pure): `link-state.ts`, `access-state.ts` (transition tables M20 §7.1, §7.3), `levels.ts` (`covers(granted, required)` + resource → level table), `auto-link.ts`.

## Invariants

- A buyer never reads supplier data without `linked` + `granted` for that year; below the required level the answer is 404, never 403.
- Buyer creates rows; only the supplier side changes decision columns (`status` to granted/declined/revoked, `level`, `physical_audit`, `consent_id`) — service + trigger + e2e test.
- No `granted` row without a consent id; consents are append-only.
- Every successful `assertCanView` writes two audit rows; exports write `supplier_access.exported`.
- An unrelated workspace sees nothing (RLS returns no rows; routes 404).
- Revocation never deletes the buyer's own records (M19).

## Tests

- Engine: `engine/*.spec.ts` + `engine/supplier-portal.property.spec.ts` (no action sequence reaches `granted` without consent; unlink always leaves no `granted` rows).
- E2e (planned): `test/supplier-portal-invite.e2e-spec.ts` (US-20-1, 2, 3, 4), `test/supplier-portal-sharing.e2e-spec.ts` (US-20-5, 6, 8, 9, 11), `test/supplier-portal-audit.e2e-spec.ts` (US-20-7, 10), RLS from buyer, supplier and an unrelated workspace in `test/tenancy-rls.e2e-spec.ts` (US-20-12); public routes rate-limited; supplier routes pass without the `due_diligence` entitlement.

## Not here

The supplier record, sites, contacts and `platform_status` column (`supplier-register`); what each resource contains (questionnaires, supplier-evidence, dd-audits, M05 gap results — they call `assertCanView`); emails and in-app delivery (`notifications`); sign-up and verification (`identity`).
