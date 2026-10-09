# Workspaces & companies (M02 · SD01)

> Spec: `docs/revamp/modules/M02-workspaces-companies.md` · Status: Shipped (first slice, deferrals in M02 §9) · Wave: 0

## Purpose

Tenancy and the organisations inside it: workspaces, their plan limits and module entitlements, companies (with soft delete and restore), partner workspaces onboarding client workspaces, and the sector/country reference lookups.

## Owns

- Tables: `workspaces`, `entitlements`, `companies`, `partner_grants`, reference `sectors` and `countries` (seeded in `prisma/seed`).
- Routes: `/v1/workspaces/current*`, `/v1/companies*`, `/v1/partner/clients`, `/v1/platform/workspaces*`, `/v1/reference/{sectors,countries}`.
- Permissions used: `workspace:manage`, `company:create`, `company:update`, `project:read`, `partner:manage`, `platform:*`.
- Events/audit actions: `WorkspaceEvents` in `events.ts` (`workspace.*`, `company.*`, `entitlements.changed`, `partner_grant.*`).

## Public surface (`index.ts`)

| Export             | Why others need it            |
| ------------------ | ----------------------------- |
| `WorkspacesModule` | Registered in `app.module.ts` |

Planned exports when the DD modules need them (add with their PR): a company read model by id (`supplier-register` buyer company), the entitlement check for the `due_diligence` module, `WorkspaceEvents`.

## Depends on

`identity` (users, mailer, token helpers, `decidePermission`), `audit`.

## Components & behaviour

- `workspaces.service.ts` — current workspace profile, entitlements, partner grants.
- `companies.service.ts` — CRUD with plan limits (`engine/limits.ts`), soft delete + restore window, activity feed from audit events; `companies-purge.task.ts` hard-deletes after the window (worker).
- `partner.service.ts` — partner creates a client workspace + owner invite in one transaction, records a partner grant the client can revoke.
- `platform-workspaces.service.ts` — platform staff edit plans and entitlements and suspend workspaces (US-02-5: users of a suspended workspace cannot write).
- `reference.controller.ts` — sector and country lookups; moves to `reference-data` (M13) when that module is built, keeping the routes.

## Invariants

- Every query runs inside `prisma.withTenant`; another workspace's ids answer 404.
- Plan limits and entitlements are decided server-side by `engine/limits.ts` and the entitlement table, never by the client.

## Tests

`engine/limits*.spec.ts`; e2e `test/workspaces-companies.e2e-spec.ts`, `test/tenancy-rls.e2e-spec.ts`. Stories `US-02-*`.

## Not here

Users and roles (`identity`), projects (M03), suppliers (`supplier-register`), files and logos (`files`, M14).
