# M02 — Workspaces, Companies, Entitlements & Partners

> Status: Draft · Phase: 1 · Depends on: M01 · Blocks: M03–M18
> Legacy code: BE `server/models/agency.js`, `company.js`, `schema/mutations/agency/*`, `company/add.js`, `company/update.js`, `company/updateSurveyEmailTemplates.js`, `queries/company/*`, `queries/agency/*`, `controllers/logs.js` (activity log) · FE `company/*`, `agencies/*`, `user/AgencyDashBoard.js`, `user/NewAgency.js`, `topBar/TopBarAgency.js`

## 1. Purpose
Model *who the customer is*: the tenant workspace, the reporting companies inside it, what they have bought, and which partners (resellers/consultants) may act on their behalf.

Legacy mapping: an **agency** is the tenant workspace (one is auto-created per onboarded client company in `company/add.js:117-143`); a **company** is the reporting entity; **resellers** are users who onboard companies (`company.reseller`); **licences** (`lisence: gap | materiality | actions`) gate features; `totalCompaniesAllowed` limits how many companies a reseller/admin can add.

## 2. Users & permissions
| Role | Can |
|---|---|
| workspace_owner | Everything in the workspace incl. entitlements view, delete workspace, transfer ownership |
| workspace_admin | Manage companies, settings, email templates, branding |
| partner_admin | Create client workspaces + companies (within partner quota), manage them via `partner_grants` |
| platform_owner | Create/suspend workspaces, set entitlements & limits, see all |
| others | Read workspace/company profile |

## 3. Current state (legacy) — issues to design out
- Onboarding a company silently creates a user **with the password typed into the company form** (stored in plaintext on the company) and a new agency, or attaches to the contact person's *current* agency if the email exists — surprising and insecure.
- Tenant switching (`currentAgency`) is unchecked; lists are filtered in the browser (`reseller === currentUser._id`); licence gating and `totalCompaniesAllowed` only enforced in the FE.
- Company edit form mixes profile, licences, reseller assignment and contact password; delete-company UI exists but is never mounted; `removeCompany` is broken (Mongoose 8).
- "Activity log" (`/api/activitylog/:companyId`) is synthesised, not real.
- Survey email templates (4 per company: internal/external × invite/reminder) are free text without variables or preview.

## 4. Scope
### 4.1 Must have
- **Workspace**: name, slug, logo, primary contact, country, default locale & timezone, data region, status (`trial | active | suspended | closed`), created from (a) platform admin, (b) partner onboarding, (c) self-service trial sign-up.
- **Company** (reporting entity) inside a workspace: legal name, display name, registration no., sector (from the legacy sector cascader list `companySectors.js`, ~49 entries — migrate to a reference table with NACE/ISIC codes), size band, employee count, country + region, website, product/service description, address, logo, fiscal-year start month, reporting currency.
- A workspace may contain **several companies** (groups, holding structures). Optional parent/child hierarchy between companies for consolidation (Phase 3 — feature #14).
- **Entitlements**: modules (`gap`, `materiality`, `actions`, `surveys`, `supply_chain`, `ranking`, `frameworks`, `ai`, `carbon`), limits (companies, users, projects/year, AI budget), plan name, trial end. Enforced server-side (403 `entitlement_required` with the missing module).
- **Partner onboarding**: a partner workspace (legacy reseller) creates a client workspace + first company + invites the client's owner by email (no password typing on behalf of the client). The partner keeps a `partner_grant` until the client revokes it.
- **Settings**: branding (logo, accent for reports/emails), survey email templates (see M08), notification defaults, AI opt-in (M17), data retention preference.
- **Workspace switcher** data (`GET /v1/me` memberships) and a per-workspace home.
- **Real activity feed** per company/workspace from `audit_events` (M12).
- Soft-delete company/workspace with 30-day restore; hard delete job afterwards (GDPR).

### 4.2 New
- Company hierarchy & consolidation (Phase 3).
- Billing (Stripe) — Phase 4; entitlements set manually by platform owner until then.
- Custom domain / white-label for partners (Phase 4).

## 5. User stories & acceptance criteria
- **US-02-1** As a partner admin I onboard a new client: workspace name, company details, owner email → the owner receives an invitation; the partner sees the workspace in the switcher.
  - AC: blocked with a clear message when the partner's `limits.clientWorkspaces` is reached; audit `workspace.created` + `partner_grant.created`.
- **US-02-2** As a workspace owner I revoke my partner's access; the partner loses access immediately (next request) and gets an email.
- **US-02-3** As a workspace admin without the `materiality` module, I see the Materiality nav item with a lock icon and an "Available in Professional plan – contact us" panel instead of a broken page.
- **US-02-4** As a workspace admin I add a second company (subsidiary) and switch the company context in the top bar; project lists filter by the selected company.
- **US-02-5** As a platform owner I suspend a workspace; its users see a suspension notice and cannot write; survey links show "survey closed".

## 6. Domain model
```ts
workspaces    { id, name, slug unique, logo_file_id?, country, default_locale, timezone, data_region: 'eu'|'in'|'us',
                status, trial_ends_at?, created_via: 'platform'|'partner'|'self_service', partner_workspace_id?,
                branding jsonb { accentColor?, reportFooter? }, settings jsonb, legacy_agency_id?, created_at, updated_at, deleted_at? }
entitlements  { workspace_id pk, plan, modules text[], limits jsonb { companies, users, projectsPerYear, clientWorkspaces?, aiMonthlyUsd? },
                updated_by, updated_at }
companies     { id, workspace_id, parent_company_id?, legal_name, display_name, registration_no?, sector_code → sectors,
                size_band, employee_count?, country, region?, website?, description?, address jsonb?, logo_file_id?,
                fiscal_year_start_month smallint default 1, currency char(3), contact_user_id?, legacy_company_id?,
                created_at, updated_at, deleted_at? }
sectors       { code pk, parent_code?, label_key, isic_code?, nace_code? }          -- reference data (global)
countries     { code pk (ISO 3166-1 alpha-2), region, label_key }                     -- reference data (global)
```
RLS on `companies`, `entitlements` by `workspace_id`. `workspaces` readable only through membership/grant checks.

## 7. Business rules
- Entitlement check order: authenticated → member/grant → role permission → module entitled → limit not exceeded.
- A partner cannot grant itself modules; entitlements are platform-owned.
- Deleting a company with projects requires typing the company name; projects, answers and files are soft-deleted together; restorable 30 days.
- A workspace must always have ≥ 1 owner.

## 8. API contract (REST `/v1`)
| Route | Permission |
|---|---|
| `GET /workspaces/current` · `PATCH /workspaces/current` | member · `workspace:manage` |
| `GET /workspaces/current/entitlements` | member |
| `GET /companies` · `POST /companies` · `GET/PATCH/DELETE /companies/:id` · `POST /companies/:id/restore` | `project:read` · `company:create/update` |
| `GET /partner/clients` · `POST /partner/clients` (create client workspace + company + owner invite) | partner_admin |
| `DELETE /workspaces/current/partner-grants/:id` | workspace_owner |
| `GET /reference/sectors` · `GET /reference/countries` | authenticated (cacheable) |
| `GET /platform/workspaces` · `PATCH /platform/workspaces/:id` (status) · `PUT /platform/workspaces/:id/entitlements` | platform_owner |
| `GET /companies/:id/activity` | `project:read` (from audit events) |

## 9. UI
- `/settings/workspace` (profile, branding, data region read-only), `/settings/plan` (entitlements, usage vs limits).
- `/companies` list (DataTable: name, sector, country, projects, last activity) + `/companies/:id` (tabs: Overview · Projects · Stakeholders · Suppliers · Settings).
- Create company: `Sheet` with 2 sections (identity, profile); no contact-password field — contact is invited via M01.
- Partner console `/partner/clients`: table of client workspaces with status, active project, last activity, quick "open workspace".
- Locked-module pattern (lock icon + upsell panel) for non-entitled modules.

## 10. Events & audit
`workspace.created|updated|suspended|deleted`, `company.created|updated|deleted|restored`, `entitlements.changed`, `partner_grant.created|revoked`.

## 11. Migration
- `agencies` → `workspaces` (+ `legacy_agency_id`); agency `partners[]` → M10 supplier links (not partner grants — see naming note in M10).
- `companies` → `companies` (drop `password`, `personName/personEmail` → invite owner or link `contact_user_id` if user exists); `lisence[]` → `entitlements.modules` of the workspace (union over its companies); `suppliers[]` → M10.
- Users with role `Reseller` → a partner workspace named after the user's organisation + `partner_grants` to each workspace of companies where `company.reseller` = that user; `totalCompaniesAllowed` → `limits.clientWorkspaces`.

## 12. Test plan
- RLS test: a query with workspace A context never returns rows of workspace B (run for every tenant table, generated).
- Entitlement guard unit tests; partner grant revocation effective immediately.
- E2E: partner onboards client → owner accepts → owner revokes partner.

## 13. Open questions
- Should one company ever be shared by two workspaces (e.g. group + consultant)? Current design: no — use partner grants instead.
- Data residency: which customers need India vs EU hosting?
