# Identity & access (M01 · SD01)

> Spec: `docs/revamp/modules/M01-identity-access.md` · Status: Shipped (first slice) · Wave: 0

## Purpose

Sign-in, sessions, MFA, invitations, workspace memberships and the role → permission matrix that every other module's `@Can` relies on.

## Owns

- Tables: `users`, `memberships`, `invitations`, `refresh_tokens`, `password_resets`, `email_verifications`, `mfa_recovery_codes`.
- Routes: `/v1/auth/*`, `/v1/me/*`, `/v1/workspaces/:wid/members|invitations*`, `/v1/invitations/accept`, `/v1/platform/users/*`.
- Permissions: the matrix itself (`engine/permissions.ts`); other modules add their permission strings there with their spec reference.
- Events/audit actions: `AuthEvents` in `events.ts` (`auth.*`, `user.*`, `membership.*`, `invitation.*`, `impersonation.*`, `platform.*`).

## Public surface (`index.ts`)

| Export                                                   | Why others need it                                                                        |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `IdentityModule`                                         | Imported by modules that inject the services below                                        |
| `AuthenticationGuard`                                    | Global guard, registered in `app.module.ts`                                               |
| `UsersRepository`                                        | Look up or create a user by email (company owner, partner onboarding)                     |
| `IdentityMailer`, `identityEmails`, `transactionalEmail` | Send identity-style transactional mail with the shared layout                             |
| `AuthEvents`                                             | Audit action names when another module records an identity-related action                 |
| `slugify`                                                | Workspace slugs, same rule as sign-up                                                     |
| `emailField`                                             | The one Zod email rule (trim, lower-case, max 254)                                        |
| `encodeTenantToken`, `expiresAt`, `hashToken`, `TTL`     | Token helpers for invite-style links (partner onboarding)                                 |
| `decidePermission`, `PermissionDecision`                 | Permission checks outside a route (also read by `src/common/auth/authorization.guard.ts`) |

## Depends on

`audit` (`AuditService`), kernel (`common`, `infra/prisma`, `infra/email`, `infra/redis`, `infra/rate-limit`).

## Components & behaviour

- `auth.service.ts` — login with lockout (`engine/lockout.ts`), breached-password check, refresh-token rotation with reuse detection (revokes the family), sign-up + email verification.
- `token.service.ts` — short-lived access JWT in memory on the client, refresh in an httpOnly cookie (ADR-005).
- `mfa.service.ts` — TOTP (`engine/totp.ts`) with recovery codes; login answers `mfaRequired` or `mfaEnrollmentRequired` before issuing a session.
- `members.service.ts` — invitations (single and CSV, `engine/invite-csv.ts`), role changes guarded by `canGrantRole` / `canManageMember`.
- `platform-users.service.ts` — platform owner tools incl. impersonation with an audit trail.
- `identity-cleanup.task.ts` — scheduled purge of expired tokens and sessions (worker).

## Invariants

- No token, password, OTP or cookie ever logged (pino redaction).
- A workspace always keeps at least one `workspace_owner`.
- Every authentication outcome and membership change writes an audit event.

## Tests

Engines: `engine/*.spec.ts`, `engine/identity.property.spec.ts`. E2e: `test/identity-*.e2e-spec.ts`, `test/route-authorization.e2e-spec.ts`, `test/route-access-matrix.e2e-spec.ts`. Stories `US-01-*`.

## Not here

Workspaces, companies and entitlements (`workspaces`), notifications beyond transactional mail (`notifications`, M12), supplier invitations (`supplier-portal`, which reuses the token helpers above).
