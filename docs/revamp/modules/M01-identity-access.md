# M01 — Identity & Access (auth, users, roles, tenancy)

> Status: In progress · Phase: 1 (legacy hotfixes are Phase 0 — see `00-current-state-review.md` §2) · Depends on: — · Blocks: every other module
> Legacy code: `CSR_BE/server/services/passport.js`, `checkAuth.js`, `controllers/authentication.js`, `controllers/userController.js`, `routes/userRoutes.js`, `router.js`, `schema/mutations/user/*`, `schema/queries/user/*`, `index.js` (GraphQL JWT fallback) · `Resilisense-FE/src/components/auth/*`, `user/*`, `actions/AuthActions.js`, `ApolloClient.js`

## 1. Purpose
Authenticate users, manage their accounts and decide what each user may do in which organisation. In the legacy app this is the weakest area (see `00-current-state-review.md` §2): several endpoints allow account takeover without logging in. The rebuild makes authorisation impossible to forget.

## 2. Roles (target) and mapping from legacy

Legacy role strings: `Client` (default), `Admin`, `Reseller`, `superadmin`, `user`, plus pipe-delimited combos (`"Admin|Client"`); `Docs/AccessLevels.xlsx` also names **Ranking**. Legacy licence flags on user/company: `lisence: ['gap' | 'materiality' | 'actions']`.

| Target role | Scope | Legacy source | Summary |
|---|---|---|---|
| `platform_owner` | platform | `superadmin` | Everything, incl. platform settings, content library, impersonation (audited) |
| `platform_assessor` | platform (cross-tenant, limited) | `Admin` | Reviews gap-analysis evidence and scores for projects in an assessment state (M05); sees all projects list; cannot edit tenant data outside the review |
| `platform_support` | platform (read-only) | — new | Read-only access for support, every access audited |
| `partner_admin` | partner org → delegated to client workspaces | `Reseller` | Onboards client companies, sees/manages the workspaces they onboarded (via `PartnerGrant`) |
| `workspace_owner` | workspace | first user of an agency | Billing/entitlements, can delete workspace, manage admins |
| `workspace_admin` | workspace | `Client` | Manage companies, users, projects, stakeholders, surveys, suppliers |
| `contributor` | workspace (optionally restricted to companies/projects) | — new (legacy `permission.subsidiary` = view-only exists in FE enum) | Answer assigned questions, upload evidence, enter KPI data |
| `viewer` | workspace | `subsidiary` "View Only" | Read-only |
| `auditor` | workspace, time-boxed | — new | Read-only incl. evidence and audit trail; for external assurance providers |
| *(relationship, not a role)* supplier | buyer company ↔ supplier workspace | legacy `agency.partners` / `company.suppliers` | Governed by `SupplierLink` visibility flags in M10 |

**Entitlements** (what the workspace has bought) are separate from roles: `modules: ['gap','materiality','actions','ranking','surveys','ai','carbon','frameworks']`, `limits: { companies: n (legacy totalCompaniesAllowed), users: n, projectsPerYear: n }`. A permission check passes only if role **and** entitlement allow it.

### Permission matrix (initial)

| Permission | owner | admin | contributor | viewer | auditor | partner_admin* | assessor | platform_owner |
|---|---|---|---|---|---|---|---|---|
| `workspace:manage` / `billing:manage` | ✔ | — | — | — | — | — | — | ✔ |
| `org:manage-users` | ✔ | ✔ | — | — | — | ✔ | — | ✔ |
| `company:create/update` | ✔ | ✔ | — | — | — | ✔ | — | ✔ |
| `project:create/configure` | ✔ | ✔ | — | — | — | ✔ | — | ✔ |
| `project:read` | ✔ | ✔ | ✔ (assigned) | ✔ | ✔ | ✔ | ✔ (in review) | ✔ |
| `gap:answer`, `evidence:upload` | ✔ | ✔ | ✔ (assigned) | — | — | ✔ | — | ✔ |
| `gap:submit-for-review` | ✔ | ✔ | — | — | — | ✔ | — | ✔ |
| `gap:review` | — | — | — | — | — | — | ✔ | ✔ |
| `materiality:rate`, `stakeholder:manage`, `survey:send` | ✔ | ✔ | — | — | — | ✔ | — | ✔ |
| `kpi:enter` | ✔ | ✔ | ✔ | — | — | ✔ | — | ✔ |
| `supplier:manage`, `supplier:rank` | ✔ | ✔ | — | — | — | ✔ | — | ✔ |
| `report:export` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `audit:read` | ✔ | ✔ | — | — | ✔ | — | — | ✔ |
| `platform:*` | — | — | — | — | — | — | — | ✔ |

\* on workspaces covered by a `PartnerGrant` only. A user acts as `partner_admin` in a client workspace when they are `workspace_owner` or `workspace_admin` of a workspace that holds an active (non-revoked) `partner_grant` to it; `partner_admin` is not a membership role. For role-ceiling rules (§7) it ranks as `workspace_admin`.

`platform_support` (not a matrix column above): `project:read`, `report:export`, `audit:read` — read-only, in any workspace, every cross-tenant access audited. `platform_assessor` holds `project:read`, `gap:review`, `report:export`; the "in review" restriction and its cross-tenant reads are enforced by M05.

**Permission → entitlement module** (decided 2026-09-30; one module list, M02's: `gap`, `materiality`, `actions`, `surveys`, `supply_chain`, `ranking`, `frameworks`, `ai`, `carbon`). A permission not listed needs no module. A role that has the permission but a workspace without the module gets `403 entitlement_required` with the missing `module`.

| Permission | Module |
|---|---|
| `gap:answer`, `gap:submit-for-review`, `gap:review`, `evidence:upload` | `gap` |
| `materiality:rate`, `stakeholder:manage` | `materiality` |
| `survey:send` | `surveys` |
| `kpi:enter`, `kpi:manage` | `actions` |
| `supplier:manage` | `supply_chain` |
| `supplier:rank` | `ranking` |
| `ai:use`, `ai:configure` | `ai` |

## 3. Current state (legacy) — must-fix list
All verified in code; details and line refs in `00-current-state-review.md`.
- Unauthenticated REST `/api/users` (create user with any role, list users incl. `otp`), `/api/users/:id`, `/api/users/reset-password`.
- Unauthenticated GraphQL `updateNewUserPassword` (set any user's password by id); `forgotPassword` OTP from `Math.random`, plaintext, no expiry, no attempt limit, account enumeration.
- `updateCompany` sets the password of the user matching `personEmail`; `Company.password` stored in plaintext and exposed via GraphQL.
- `updateUser` stores passwords unhashed (`findByIdAndUpdate` bypasses the pre-save hook) and lets users change their own `role`, `agencies`, `companies`.
- `/api/signup` accepts `role` and returns a token immediately; inactive-user check in `passport.js` is inverted; JWT strategy ignores `active`.
- JWT secret hardcoded and identical in dev/prod; tokens never expire (`jwt-simple`, `iat` in ms); token also used as email-verification link (hardcoded `http://localhost:4000`).
- `updateCurrentAgencyUser` switches to any agency without membership check → full cross-tenant access.
- FE stores the token in `localStorage`.

## 4. Scope
### 4.1 Must have
- Email + password sign-in, sign-out (all devices), session refresh (ADR-005 in `01-target-architecture.md`).
- Invitation-based onboarding (no public role selection). Self-signup allowed only to create a *new* workspace (trial), with email verification before first login.
- Password reset with single-use, hashed, 15-minute token (link, not OTP) + rate limit + generic responses.
- Email verification and email change (confirm new address).
- User profile: name, job title, phone, language, timezone, avatar, notification preferences, theme.
- Memberships: a user can belong to many workspaces with different roles; workspace switcher (replaces `currentAgency`, stored per session, validated on every request).
- User management UI for admins: invite (email, role, company/project scope), resend invite, change role, deactivate, remove; bulk invite via CSV.
- Terms & licence acceptance with version + timestamp (legacy `termsAndConditions` flag + `user-license-agreeement*.pdf`).
- Authorisation framework: `@Can()` guard, tenancy context + PostgreSQL RLS, `GET /v1/me` returns permissions for the FE.
- Account lockout after 10 failed logins / 15 min (the account is then locked for 15 min; the response stays the generic invalid-credentials error); login notifications for new device (optional).
### 4.2 New
- TOTP MFA (mandatory for platform roles; optional/enforceable per workspace).
- SSO via OIDC (Microsoft Entra ID, Google Workspace) with JIT provisioning into a workspace by email domain (Phase 3).
- Impersonation for platform support with banner + audit.
- Personal access tokens for the public API (Phase 4).
### 4.3 Out of scope
- SAML (evaluate on customer demand).

## 5. User stories & acceptance criteria
- **US-01-1** As a workspace admin I invite a colleague as *contributor* limited to project "2026 Assessment".
  - AC: invite email with link valid 7 days; accepting sets password (policy: ≥ 12 chars, zxcvbn score ≥ 3, not in breached list); membership created with `scope.projectIds`; audit event `user.invited`, `membership.created`.
- **US-01-2** As any user I reset my password.
  - AC: response identical whether or not the email exists; token single-use, hashed (SHA-256) in DB, expires in 15 min; all refresh tokens revoked after reset; max 5 requests / hour / email and / IP.
- **US-01-3** As a user in two workspaces I switch workspace from the top bar; every subsequent request is scoped to it and data from the other workspace is never visible.
- **US-01-4** As a developer, a new controller route without `@Can` or `@Public` fails CI.
- **US-01-5** As a platform owner I can see and revoke active sessions of any user.

## 6. Domain model (PostgreSQL)
```ts
users            { id, email citext unique, email_verified_at?, password_hash?, password_algo: 'argon2id'|'bcrypt',
                   name, job_title?, phone?, locale, timezone, avatar_file_id?,
                   platform_role?: 'platform_owner'|'platform_assessor'|'platform_support',
                   mfa_totp_secret_enc?, mfa_enabled_at?, status: 'invited'|'active'|'disabled',
                   last_login_at?, failed_login_count, locked_until?, terms_version?, terms_accepted_at?,
                   legacy_id? (Mongo ObjectId hex), created_at, updated_at }
memberships      { id, user_id → users, workspace_id → workspaces, role: 'workspace_owner'|'workspace_admin'|'contributor'|'viewer'|'auditor',
                   company_ids uuid[]?, project_ids uuid[]?  -- optional scope
                   expires_at?, invited_by, created_at }                        unique(user_id, workspace_id)
partner_grants   { id, partner_workspace_id, client_workspace_id, granted_by, created_at, revoked_at? }
invitations      { id, workspace_id, email, role, company_ids?, project_ids?, token_hash, expires_at, accepted_at?, invited_by }
refresh_tokens   { id, user_id, family_id, token_hash unique, user_agent, ip inet, current_workspace_id?, impersonator_id?,
                   created_at, expires_at, revoked_at?, replaced_by? }             -- family_id = session id
password_resets  { id, user_id, token_hash unique, expires_at, used_at? }
email_verifications { id, user_id, email, purpose: 'signup'|'email_change', payload jsonb?, token_hash unique, expires_at, used_at? }
mfa_recovery_codes { id, user_id, code_hash, used_at? }
```
Additions decided 2026-09-30: `users.theme ('system'|'light'|'dark')`; `memberships.deactivated_at?` (deactivate without removing; a deactivated membership grants nothing); `refresh_tokens.current_workspace_id` (the session's workspace, kept across refresh); `email_verifications` (signup verification and email change, 24 h tokens). `avatar_file_id` is a plain uuid without FK until M14 lands. `invitations` is tenant-owned (RLS by `workspace_id`); the invitation token embeds the workspace id so the public accept route can open the right tenant context.
Scheduled cleanup job deletes expired tokens/resets daily. `users` and `memberships` are **not** RLS-scoped by workspace (a user spans workspaces); access goes through the identity service only.

## 7. Business rules
- Only `workspace_owner`/`workspace_admin` can grant roles ≤ their own; nobody can change their own role; a workspace always keeps ≥ 1 owner.
- `platformRole` can only be set by `platform_owner` via admin UI/CLI, never by an API taking user input.
- Seeding: `npm run seed:owner -- --email … ` creates the first platform owner with a one-time reset link; no credentials in config; nothing seeded on boot.
- Legacy bcrypt hashes are accepted and re-hashed to argon2id at next successful login. Plaintext passwords found in migration (users updated via `updateUser`, `Company.password`) are **not** migrated — those users get a forced reset email.

### 7.1 Decisions (owner-approved 2026-09-30)
- **Authenticated-only routes** (`/me*`, `POST /auth/logout`, MFA management, workspace switch) carry `@Authenticated()` — the third allowed route marker next to `@Can()` and `@Public()`. `POST /auth/refresh` is `@Public()` and validates the refresh cookie itself.
- **Access token**: EdDSA (Ed25519) JWT, 15 min, claims `sub`, `wid` (current workspace or null), `sid` (session = refresh-token family), `imp` (impersonator, if any), `aud`, `iss`, `exp`, header `kid`. Keys from env `JWT_PRIVATE_KEY` + `JWT_KEY_ID`; previous public keys in `JWT_PREVIOUS_PUBLIC_KEYS` for rotation. Membership, grant, entitlements and session revocation are re-checked on every request, so removing a member or revoking a session takes effect immediately.
- **MFA flow**: when MFA is enabled, `POST /auth/login` returns `{ mfaRequired: true, mfaToken }` (5-minute, single-purpose token) and `POST /auth/mfa/verify { mfaToken, code | recoveryCode }` issues the session. Setup is two steps: `POST /auth/mfa/setup` returns the secret + `otpauth://` URI; `POST /auth/mfa/confirm { code }` enables MFA and returns 10 one-time recovery codes. A platform user without MFA gets `{ mfaEnrollmentRequired: true, mfaToken }` whose token only works on setup/confirm; confirm then issues the session. Platform users cannot disable MFA. TOTP secrets are encrypted with AES-256-GCM (`MFA_ENCRYPTION_KEY`). Codes: RFC 6238, SHA-1, 6 digits, 30 s, ±1 step, a code cannot be reused. Per-workspace MFA enforcement arrives with M02 workspace settings.
- **Breached passwords**: Have I Been Pwned range API (k-anonymity, padded) behind a `BreachedPasswordChecker` adapter (`BREACHED_PASSWORD_CHECK=hibp|off`); if the service is unreachable the check passes and a warning is logged. HIBP is listed as a sub-processor.
- **Self-signup**: `POST /auth/signup { name, email, password, workspaceName }` (public, rate-limited, always the same `202` response; an existing address receives a "you already have an account" email). On `POST /auth/verify-email` the user is verified and a `trial` workspace + `workspace_owner` membership + trial entitlements (`TRIAL_MODULES`, default `gap`; limits companies 1, users 5, projectsPerYear 1 — provisional until M02 plans exist) are created.
- **Email change**: `POST /me/email { newEmail, password }` sends a 24 h verification link to the new address; the change applies on verification and the old address is notified.
- **Current workspace**: `wid` claim + `refresh_tokens.current_workspace_id`; membership (or grant / platform role) re-validated on every request. At login the workspace is `workspaceId` from the body if accessible, else the session's last workspace, else the oldest membership.
- **Contributor scope**: M01 stores and exposes `company_ids`/`project_ids` on the principal; project/question-level "assigned" resolution is done by M03/M04 against that scope.
- **Impersonation**: `platform_owner` only, at most 60 minutes, never of a `platform_owner` or of oneself, access token only (no refresh), `imp` claim, `impersonation.started|ended` audited, `GET /me` returns `impersonatedBy` for the banner.
- **Cross-tenant access** by `platform_owner`/`platform_support` in a workspace where they have no membership is audited per request (`platform.cross_tenant_access`).
- **Accepting an invitation as an existing user** needs no password, unless the account's email was never verified (or it is a migrated `invited` user): then the password is set anew and existing sessions are revoked, so an unverified sign-up made with someone else's address cannot capture the membership.
- **Bulk invite CSV**: header `email,role,company_ids,project_ids`; id lists separated by `;`; max 200 rows.
- **Terms**: `POST /me/terms { version }` records acceptance; `GET /me` returns `termsAcceptanceRequired` when the accepted version differs from `TERMS_VERSION`.
- **Audit**: M01 creates the minimal append-only `audit_events` table defined in M12 §3 (insert/select only under RLS; hash chain and partitioning added by M12).
- Out of scope for the first M01 PR: SSO (Phase 3), personal access tokens (Phase 4), new-device login email (optional).

## 8. API contract (REST, `/v1`)

| Method & path | Permission | Notes |
|---|---|---|
| `POST /auth/login` | public (rate-limited) | → `{ accessToken, expiresIn, mfaRequired? }` + refresh cookie |
| `POST /auth/refresh` | refresh cookie | rotates refresh token |
| `POST /auth/logout` | authenticated | `?all=true` revokes all sessions |
| `POST /auth/password/forgot` · `POST /auth/password/reset` | public (rate-limited) | generic response |
| `POST /auth/signup` · `POST /auth/verify-email` · `POST /auth/verify-email/resend` | public (rate-limited) | generic responses (§7.1) |
| `POST /auth/mfa/verify` | public, `mfaToken`-gated (rate-limited) | |
| `POST /auth/mfa/setup` · `POST /auth/mfa/confirm` | authenticated (or enrolment `mfaToken`) | |
| `DELETE /auth/mfa` | authenticated | body `{ password, code }`; not for platform roles |
| `POST /auth/impersonation/end` | authenticated (impersonation token) | |
| `GET /auth/sso/:provider/start` · `GET /auth/sso/:provider/callback` | public | Phase 3 |
| `GET /me` | authenticated | `{ user, currentWorkspace, memberships[], permissions[], entitlements }` |
| `PATCH /me` · `POST /me/password` · `POST /me/email` · `POST /me/terms` · `GET /me/sessions` · `DELETE /me/sessions/:id` | authenticated | |
| `POST /me/workspace` `{ workspaceId }` | member of target | switch workspace (re-issues access token with `wid` claim) |
| `GET /workspaces/:wid/members` · `PATCH /workspaces/:wid/members/:id` · `DELETE …` | `org:manage-users` | cursor pagination, filter by role/status; `:wid` must be the current workspace, otherwise `404` |
| `POST /workspaces/:wid/invitations` (bulk) · `POST …/invitations/csv` · `GET …` · `POST …/:id/resend` · `DELETE …/:id` | `org:manage-users` | `Idempotency-Key` supported on the POSTs |
| `POST /invitations/accept` | public, token-gated | sets password if new user |
| `GET /platform/users` · `PATCH /platform/users/:id` · `POST /platform/users/:id/impersonate` | `platform:*` | audited |
| `GET /platform/users/:id/sessions` · `DELETE /platform/users/:id/sessions/:sid` | `platform:*` | US-01-5, audited |

## 9. UI
- `/sign-in`, `/forgot-password`, `/reset-password/:token`, `/accept-invite/:token`, `/verify-email/:token`, `/sign-up` (trial) — minimal shell, brand panel on the start side with product value props, form on the end side; SSO buttons when enabled.
- `/settings/profile`, `/settings/security` (password, MFA, sessions), `/settings/notifications`.
- `/settings/members` (DataTable: name, email, role, scope, status, last active; invite via Sheet; bulk CSV).
- Top bar workspace switcher with search when > 5 workspaces.

FE implementation notes (2026-09-30):
- `/settings/notifications` is deferred to M12: `PATCH /me` has no notification-preference fields yet.
- Avatar upload waits for M14 (only `avatarFileId` exists); profiles show initials.
- Invite / member scope is shown as counts ("Whole workspace" or "n companies, m projects") and invites are workspace-wide until M02/M03 expose companies and projects to pick from; the API already accepts `companyIds`/`projectIds`.
- Terms gate: blocks the app while `termsAcceptanceRequired` (skipped while impersonating); the document link comes from `VITE_TERMS_URL` (`{version}` placeholder) until the API serves the document.
- `/verify-email/:token` sends the single-use token only on an explicit "Confirm" click, so mail-scanner prefetches can't burn it.
- Platform user admin (`/platform/users`, impersonate, sessions) UI belongs to M13; M01 ships the impersonation banner and "End impersonation" only.

## 10. Events & audit
`auth.login.succeeded|failed`, `auth.logout`, `auth.password.reset.requested|completed`, `auth.mfa.enabled|disabled`, `user.invited`, `membership.created|updated|removed`, `workspace.switched`, `impersonation.started|ended` — all in `AuditEvent` (M12). Emails: invitation, password reset, email verification, new-device login (optional), MFA changes.

## 11. Migration from legacy
See `04-data-migration.md` §3. Summary:
1. Mongo `users` → `users` (new UUID, `legacy_id` = ObjectId hex; `lang` → `locale`; drop `otp`). `password` is imported as `password_hash` with `password_algo='bcrypt'` **only** if it matches `^\$2[aby]\$\d\d\$`; otherwise null + forced reset email (plaintext passwords from `updateUser` / `Company.password` are never migrated).
2. Each `agency` → `workspaces` (M02); each `user.agencies[]` → `memberships` (`Client` → `workspace_admin`; the agency's first/contact user → `workspace_owner`).
3. `Admin` → `platform_role='platform_assessor'`; `superadmin` → `platform_owner`; `Reseller` → a partner workspace + `partner_grants` for each workspace whose company has `company.reseller = user`.
4. Everyone signs in to the new app with their existing password (bcrypt verified, re-hashed to argon2id) or via reset link.

## 12. Test plan
- Unit: permission resolution (role × entitlement × scope), password policy, token hashing/expiry.
- Integration: every API route is called by (a) anonymous, (b) user from another workspace, (c) viewer — expecting `UNAUTHENTICATED`/`FORBIDDEN`/`NOT_FOUND` — generated from `openapi.json` so new routes are covered automatically.
- E2E: invite → accept → login → switch workspace → logout; reset password; MFA setup.
- Security: rate-limit tests, refresh-token reuse detection.

## 13. Open questions
- Is "Ranking" a separately sold licence? (Assume entitlement `ranking`.)
- Do resellers need to see *all* data of client workspaces or only project status/results?
