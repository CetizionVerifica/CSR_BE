# M19 — Supplier register

> Status: Draft · Phase: A (wave 2) · Depends on: M02 (companies, entitlements), M13 (reference-data: countries, sectors, categories), M14 (`files`: import uploads), M12 (`notifications`: `EventBus.publish`, `OnDomainEvent`, `notify()`; audit) · Blocks: M20 (supplier-portal), M21 (questionnaires recipients), M22 (risk factors), M10 §7 screening, M23–M26
> Split from M10 §4.1 (supplier record) on 2026-10-12 (plan item SD02). Legacy code: BE `models/externalSuppliers.js`, `controllers/externalSuppliers.js`, `models/supplierRequest.js`, `company.suppliers[]`, `agency.partners[]` · FE `suppliers/*` ("Other suppliers" register), `partners/*`

## 1. Purpose

Give a **buyer** one authoritative list of its suppliers: one record per supplier legal entity with its sites, contacts, country, sector, category, criticality, spend band, supply-chain tier (direct or sub-supplier), tags and its platform status (linked, invited, off-platform). Every other due diligence module (portal, questionnaires, evidence, risk, screening, audits, grievances) references these records by id, so the register is the first thing a procurement or compliance team fills, by hand or by CSV/XLSX import.

## 2. Users & permissions

| Role (M01) | Plan role (SD01) | Can |
| --- | --- | --- |
| workspace_owner, workspace_admin, partner_admin | procurement lead, compliance officer | Everything below: create, edit, import, tag, archive and restore suppliers (`supplier:manage`) |
| contributor, viewer, auditor | viewer, auditor | Read the register, supplier details, sites, contacts and history (`supplier:read`) |
| platform_owner | — | Everything (`platform:*`), incl. GDPR erasure of a contact |

- Both permissions need the workspace entitlement **`due_diligence`** (owner decision 2026-10-04 expects it in M02; see §13 Q1). Without it the API answers `403 entitlement_required` and the UI shows the locked-module panel.
- `supplier:read` is new and must be added to the M01 matrix (owner, admin, partner_admin, contributor, viewer, auditor). `supplier:manage` exists.

## 3. Current state (legacy)

- Three disconnected stores: `company.suppliers[]` (registered suppliers that accepted a request), `supplierRequest` (email invites) and `externalSupplier` ("Other suppliers": off-platform free text).
- `externalSupplier` has free-text `supplierCategory`, `supplierCategoryCoverage`, `engagementStatus`, `assesmentPlatformMethod`, `assesmentResult`, required `supplierEmail`, no country or sector code, **`compliance` defaults to `Noncompliant`** (every new supplier looks non-compliant) and **cannot be deleted**.
- No sites, no sub-suppliers, no tags, no import, no history; the only list is a client-side table per company.

## 4. Scope

### 4.1 Must have (parity + fixes)

- **One `suppliers` table for every supplier** of a buyer company, whatever its platform status (replaces the three legacy stores). Structured fields with reference codes instead of free text: country (ISO 3166-1 alpha-2), sector (M13 sectors), category (M13 goods/services taxonomy).
- **Fields**: legal name, display name, registration number, VAT id, external reference (ERP vendor id), country, sector, category, criticality (`low|medium|high`), annual spend band (optional), tier and parent supplier, platform status, compliance status (buyer judgement, **default `not_assessed`**, fixes the legacy `Noncompliant` default), high-concern flag + reason, suspension (set only by a corrective-actions decision, §7), notes, tags.
- **Sites** (production sites, warehouses, offices): name, country, region, city, address, activity, headcount band.
- **Contacts**: name, email, phone, role, primary flag, preferred language. One primary contact (receives invites and questionnaires).
- **Tiers**: tier 1 = direct supplier of the buyer company; tier n = sub-supplier of a tier n-1 supplier (`parent_supplier_id`). Max tier 5.
- **Archive instead of delete** (fixes "can't delete"): archive hides a supplier from lists and stops new campaigns, keeps history and other modules' references; restore brings it back. Contacts can be erased (personal data).
- **CSV/XLSX import** with a template, a validation preview (row errors, creates, updates) and an asynchronous import job (BullMQ).
- **Duplicate guard**: warn on create/import when a supplier with the same external reference, or the same registration number + country, or the same normalised legal name + country already exists for the company.

### 4.2 New in the revamp

- Register screen per `02` §9.5: supplier, country, tier, category, risk meter, questionnaire %, status pill, change since last period; filter chips tier, country, risk band, status, category; saved views; bulk actions (tag, set criticality, archive, invite to portal → M20).
- Company tab **Suppliers** (`/companies/:id/suppliers`) and a supplier detail page with tabs that other DD modules extend (Sharing, Questionnaires, Evidence, Risk, ESG rating, Audits, Corrective actions, Monitoring).
- History of every change (audit events, M12) on a supplier's Activity tab.

### 4.3 Out of scope

- Invitations, linking, sharing and the supplier's own profile → **M20 supplier-portal**. The register only shows `platform_status`.
- Risk scores, risk bands and the risk meter values → **M22 risk** (shown in the register through the risk API, never joined).
- Questionnaire progress → **M21 questionnaires**; certificates and documents → `supplier-evidence` (M14); ranking, tiers A–D and conformity → screening (M10 §7).
- Server-side register exports for reports (XLSX/PDF) → `dd-reporting`; the DataTable CSV export of the loaded rows is enough here.

## 5. User stories & acceptance criteria

- **US-19-1** As a procurement lead, I add a supplier with its legal entity, country, sector, category and criticality, so that it can be assessed.
  - AC: Given `supplier:manage` and the `due_diligence` entitlement, when I submit the create form with a legal name, buyer company and country, then the supplier appears in the register with tier 1, platform status `off_platform` and compliance `not_assessed`; a `supplier.created` event and an audit entry are written.
- **US-19-2** As a procurement lead, I record sites and contacts of a supplier, so that audits and questionnaires reach the right place and person.
  - AC: Given a supplier, when I add two contacts and mark the second as primary, then exactly one contact is primary and the first loses the flag; site country codes are validated against reference data (400 `validation_failed` otherwise).
- **US-19-3** As a compliance officer, I record a sub-supplier under a direct supplier, so that I can see my tier-2 supply chain.
  - AC: Given supplier A (tier 1), when I create B with parent A, then B has tier 2; setting A's parent to B answers 409 `conflict` (cycle); a chain deeper than 5 answers 400 `validation_failed`.
- **US-19-4** As a procurement lead, I import 2,000 suppliers from an XLSX file, so that I do not type them by hand.
  - AC: Given an uploaded file (M14 purpose `import`), when I start an import, then I get a preview with counts (create, update, skip) and row-level errors before anything is written; when I confirm, a background job writes valid rows and the summary reports created/updated/failed counts; a downloadable error CSV lists failed rows with reasons.
- **US-19-5** As a procurement lead, I archive a supplier I no longer work with instead of deleting it, so that its history stays auditable.
  - AC: Given an active supplier, when I archive it with a reason, then it disappears from the default register view, appears under the "Archived" filter, `supplier.archived` is emitted, and restore within any time brings it back unchanged; `DELETE /suppliers/:id` does not exist.
- **US-19-6** As a viewer, I filter the register by tier, country, category, status and tag and share the link, so that colleagues see the same list.
  - AC: Given filters set in the UI, the URL contains them; opening the URL in another session shows the same rows; a viewer sees no create, import, edit or archive actions and the API answers 403 to them.
- **US-19-7** As a compliance officer, I see a supplier's risk and questionnaire progress in the register without the register storing them.
  - AC: Given the risk and questionnaire modules are entitled and built, the register rows show the risk meter (label + number) and questionnaire % fetched from their APIs for the visible page; when they are not available the cells show "—" with an explanation, and the register still loads.
- **US-19-8** As a legacy customer, my "Other suppliers" appear in the register with structured fields.
  - AC: Given a migrated `externalSupplier` with compliance `Noncompliant` set only by default, then it is imported as `off_platform` with compliance `not_assessed` unless the legacy record was explicitly edited (§11).
- **US-19-9** As a workspace member of another workspace, I can never see this register.
  - AC: Given a supplier id of workspace A, every register route called in workspace B answers 404.
- **US-19-10** As a procurement lead, I apply a tag, a criticality or archive to many suppliers at once.
  - AC: Given 50 selected rows, when I run a bulk action, then all 50 are updated in one request (max 500 ids), one audit entry per supplier is written and the response lists any ids that failed.
- **US-19-11** As a compliance officer, I see in the register that a supplier was suspended after a corrective action escalation.
  - AC: Given `cap.suspension_decided { decision: 'suspend' }` for a supplier, then the supplier shows "Suspended" with the reason and a link to the CAP, `status=suspended` lists it and `supplier.updated` is emitted once; `decision: 'lift'` clears it; a PATCH body with suspension fields answers 400 `validation_failed`.

## 6. Domain model

All tables carry `workspace_id` (the buyer workspace), `created_at`, `updated_at`, RLS `workspace_id = app_current_workspace()`.

```ts
suppliers {
  id uuid, workspace_id, buyer_company_id → companies,
  legal_name, display_name?, registration_number?, vat_id?, external_ref?,          // external_ref = ERP vendor id
  country_code → countries, sector_code? → sectors, category_code? → supplier_categories (M13 reference data),
  criticality: 'low'|'medium'|'high'?, spend_band: 'lt_10k'|'10k_100k'|'100k_1m'|'1m_10m'|'gt_10m'?,
  tier smallint (1..5), parent_supplier_id? → suppliers (same workspace and buyer company),
  platform_status: 'off_platform'|'invited'|'linked',                                // projection of M20 events
  compliance_status: 'not_assessed'|'pending'|'compliant'|'non_compliant',            // default not_assessed
  high_concern boolean default false, high_concern_reason?,
  notes?, tags text[] (GIN index, lower-case, ≤ 20 tags × 40 chars),
  archived_at?, archived_by? → users, archive_reason?,
  suspended_at?, suspension_reason?, suspension_cap_id uuid?,                            // projection of cap.suspension_decided (M09)
  legacy_ref?, version int                                                            // optimistic concurrency
}
unique (workspace_id, buyer_company_id, external_ref) where external_ref is not null
index  (workspace_id, buyer_company_id, archived_at), (workspace_id, country_code), (workspace_id, parent_supplier_id)

supplier_sites    { id, workspace_id, supplier_id → suppliers, name, country_code → countries, region?, city?, address?,
                    activity?: 'manufacturing'|'warehouse'|'office'|'farm'|'mine'|'other', headcount_band?, archived_at? }
supplier_contacts { id, workspace_id, supplier_id → suppliers, name, email?, phone?, role?, locale?, is_primary boolean }
                  unique (supplier_id) where is_primary
supplier_imports  { id, workspace_id, buyer_company_id → companies, file_id → files, status, mode: 'create_only'|'upsert',
                    counts jsonb { rows, create, update, skip, failed }, errors_file_id? → files,
                    started_by → users, confirmed_at?, finished_at?, failure_reason? }
supplier_import_rows { id, workspace_id, import_id → supplier_imports, row_number, action: 'create'|'update'|'skip'|'error',
                       supplier_id?, payload jsonb, errors jsonb[] }                 // preview; purged 30 days after finish
```

Invariants: a supplier's `parent_supplier_id` belongs to the same workspace and buyer company and the parent chain has no cycle; `tier = parent.tier + 1` (1 without parent); archived suppliers cannot be parents of active ones (archiving a parent with active children answers 409 unless `cascade: true`, which archives the subtree).

## 7. Business rules & calculations

The register computes no scores. Its only derived values are in `engine/` (pure):

- **Tier** (`engine/tier.ts`): `tier(s) = s.parent ? tier(parent) + 1 : 1`; reject a parent that is the supplier itself or one of its descendants (cycle) and any result > 5. Changing a parent recomputes the tier of the whole subtree in the same transaction.
- **Normalised name** (`engine/normalise.ts`): NFKC, lower-case, collapse whitespace, strip legal-form suffixes from a fixed list (`gmbh`, `ltd`, `llc`, `sa`, `srl`, `s.r.l.`, `pvt ltd`, `inc`, `bv`, `ag`, `spa`, …) for duplicate detection only; the stored legal name is never changed.
- **Duplicate match** (`engine/match.ts`), first hit wins: (1) same `external_ref` in the buyer company; (2) same `registration_number` + `country_code`; (3) same normalised name + `country_code`. Manual create answers `409 conflict` with `existingId` unless `allowDuplicate: true`; import uses the same order to decide create vs update (`upsert`) or skip (`create_only`).
- **Import rows** (`engine/import-rows.ts`): header synonyms (case-insensitive, EN + the locale of the template) map to fields; each row validated with the create schema; reference codes accepted as code or exact label in the import locale (country names via `Intl.DisplayNames`-equivalent server table); `parent_external_ref` resolves parents inside the file or the register (rows sorted parent-first; unresolved parent → row error). Limits: 10,000 rows, 20 MB (M14 `import` purpose). Cells starting with `=`, `+`, `-`, `@` are stored as text and escaped again in the error CSV (CSV injection).
- **Import state machine**: `uploaded → validating → preview_ready → importing → completed | failed`; `preview_ready → cancelled`; a preview older than 24 h must be re-validated (`expired`). Only one `importing` job per buyer company at a time (409 otherwise).
- **Platform status**: `off_platform` on create/import; set to `invited`/`linked`/`off_platform` only by M20 events (`supplier.invited`, `supplier.linked`, `supplier.unlinked`, `supplier.invite.expired|cancelled|declined`). The register API rejects it in PATCH bodies.
- **Suspension**: `suspended_at`, `suspension_reason` and `suspension_cap_id` are set by `cap.suspension_decided { decision: 'suspend' }` and cleared by `decision: 'lift'` (M09 §7.1; a human decision in corrective-actions, never automatic). The register API rejects these fields in PATCH bodies; a suspended supplier shows the status pill "Suspended" and the filter `status=suspended`; the change emits `supplier.updated` with `changed: ['suspended']`. What suspension blocks elsewhere is M09 §13 Q1.
- **Archive**: `archived_at` set, pending work in other modules stops by event (`supplier.archived`); archived suppliers are excluded from `listSuppliers` unless `includeArchived`; restore clears the fields and emits `supplier.restored`.
- **Contact erasure**: deleting a contact hard-deletes the row (personal data) and records an audit entry without the contact's details.

## 8. API contract (REST `/v1`)

All routes: entitlement `due_diligence`; ids of another workspace answer 404; list routes use cursor pagination.

| Route | Permission |
| --- | --- |
| `GET /suppliers?companyId=&q=&status=active\|archived\|suspended\|all&platformStatus=&country=&region=&sector=&category=&criticality=&tier=&tag=&parentId=&ids=&sort=&cursor=&limit=` (`region` resolved to countries through reference-data `regionOf`; the risk heat map links here) | `supplier:read` |
| `POST /suppliers` `{ companyId, legalName, countryCode, …, allowDuplicate? }` → 201 · 409 `conflict` (`existingId`) | `supplier:manage` |
| `GET /suppliers/:id` (incl. primary contact, site count, children count) | `supplier:read` |
| `PATCH /suppliers/:id` `{ …fields, version }` → 409 `conflict` on stale `version` or parent cycle | `supplier:manage` |
| `POST /suppliers/:id/archive` `{ reason, cascade? }` · `POST /suppliers/:id/restore` | `supplier:manage` |
| `POST /suppliers/bulk` `{ ids[≤500], action: 'add_tags'\|'remove_tags'\|'set_criticality'\|'archive', value? }` → per-id result | `supplier:manage` |
| `GET /suppliers/:id/sites` · `POST /suppliers/:id/sites` · `PATCH/DELETE /suppliers/:id/sites/:siteId` (DELETE archives the site) | read: `supplier:read`; write: `supplier:manage` |
| `GET /suppliers/:id/contacts` · `POST /suppliers/:id/contacts` · `PATCH/DELETE /suppliers/:id/contacts/:contactId` | read: `supplier:read`; write: `supplier:manage` |
| `GET /suppliers/:id/activity?cursor=` (audit events of the supplier and its sites/contacts) | `supplier:read` |
| `GET /supplier-tags?companyId=` (distinct tags with counts) | `supplier:read` |
| `GET /supplier-imports/template?format=csv\|xlsx&locale=` | `supplier:manage` |
| `POST /supplier-imports` `{ companyId, fileId, mode }` → 202 (`Idempotency-Key`) | `supplier:manage` |
| `GET /supplier-imports?companyId=` · `GET /supplier-imports/:id` (status, counts) · `GET /supplier-imports/:id/rows?action=error&cursor=` | `supplier:manage` |
| `POST /supplier-imports/:id/confirm` → 202 (`Idempotency-Key`) · `POST /supplier-imports/:id/cancel` | `supplier:manage` |
| `GET /supplier-imports/:id/errors.csv` | `supplier:manage` |

Errors: 400 `validation_failed` (field paths), 403 `forbidden`/`entitlement_required`, 404 `not_found`, 409 `conflict` (duplicate, version, cycle, import already running), 409 `invalid_state_transition` (confirm a preview that is not `preview_ready`), 413 `payload_too_large`.

## 9. UI

Pattern: list page and detail page (`02` §5), register per `02` §9.5, Calm Ledger motion (`02` §9.2). Namespace `supplier-register`.

- **`/suppliers`** (nav "Suppliers", Due diligence group, permission `supplier:read`, module `due_diligence`): header (title, count, primary "Add supplier", secondary "Import"); filter bar in one row (search, chips tier · country · risk band · status · category · tag · criticality, company selector when the workspace has several companies, "Saved views ▾", "Archived" toggle); `DataTable` columns: supplier (display name + legal name), country, tier, category, **risk meter** (02 §9.4, from `GET /companies/:cid/risk/scores`, M22), questionnaire % (`ProgressBar`, from `GET /companies/:cid/questionnaire-progress?supplierIds=`, M21 §8), status pill (Linked / Invited / Off-platform / Archived, plus a "Suspended" pill), change since last period (`delta` from the same risk scores response, arrow + sign, never colour alone); row selection → bulk bar (Add tag, Set criticality, Invite to portal → M20 route `/suppliers/invite?ids=`, Archive).
  - Loading: table skeleton (8 rows). Empty (no supplier yet): explains the register and offers "Add supplier" and "Import CSV/XLSX" + template download. Empty (filters): "No supplier matches" + "Clear filters". Error: `ErrorState` with retry. Risk/questionnaire cells load separately: skeleton bar per cell, "—" with tooltip when unavailable.
  - Motion: rows `--motion-enter` on first render (≤ 12 staggered), risk meters `--motion-grow` once; filters and refetches update in place; reduced motion renders final values.
- **Create/edit**: `Sheet` with sections Identity (legal name, display name, registration no., VAT, external ref), Classification (country, sector, category, criticality, spend band), Supply chain (parent supplier combobox → tier shown read-only), Status (compliance, high concern + reason), Tags (`MultiSelect` with existing tags). Duplicate 409 shows an inline banner linking the existing supplier and "Create anyway".
- **`/suppliers/import`**: `Stepper` (Upload → Review → Import → Done): `FileDropzone` (M14 upload, CSV/XLSX ≤ 20 MB) + template links; Review shows stat tiles (rows, create, update, skip, errors) and an errors table (row, column, message) with "Download errors"; Import shows a progress bar polled every 2 s (no animation on update); Done links to the register filtered by the import's tag `import:<date>`.
- **`/suppliers/:id`** detail: header (display name, status pill, country, tier, criticality, buyer company) → URL-synced tabs: Overview (facts, high concern banner, sub-suppliers table, parent link) · Sites · Contacts · Activity, plus tabs contributed by other features as route children (Sharing → M20, Questionnaires → M21, Evidence → M14 §10, Risk → M22, ESG rating → M26, Audits → M23, Corrective actions → M09, Monitoring → M24, Grievances → M25). Composition: this feature exports `supplierDetailRoute(extraTabs)`; `src/app/router.tsx` passes the other features' tab routes (each a `RouteObject` with `handle.tab = { labelKey, order, permission?, module? }`), the factory adds them as children and lists them in its own `handle.tabs`, and the layout renders the tabs the user is permitted and entitled to see. The register never imports those features. Archived suppliers show a read-only banner with "Restore".
- **`/companies/:id/suppliers`**: the same register table scoped to the company (route child added to the companies layout).
- Keyboard: table rows reachable with Tab, Enter opens the detail; bulk bar announces "n selected" (`aria-live="polite"`); every icon button has an accessible name; 24×24 targets.

## 10. Events, notifications & audit

Event names exported from `src/modules/supplier-register/events.ts` as `SupplierEvents`:

| Event | Payload | Consumers |
| --- | --- | --- |
| `supplier.created` | `{ workspaceId, supplierId, companyId, countryCode, sectorCode, categoryCode, criticality, tier }` | risk (inherent risk), monitoring, esg-data |
| `supplier.updated` | `{ workspaceId, supplierId, changed: string[], countryCode, sectorCode, categoryCode, criticality, tier }` | risk (recompute on risk-relevant changes), monitoring, esg-data |
| `supplier.archived` | `{ workspaceId, supplierId, reason }` | portal (cancel pending invites/requests), questionnaires (cancel open assignments), supplier-evidence, dd-audits, corrective-actions, grievances, risk, monitoring, esg-data |
| `supplier.restored` | `{ workspaceId, supplierId }` | risk, monitoring |
| `supplier.import.completed` | `{ workspaceId, importId, companyId, created, updated, failed }` | — (the register itself calls `NotificationService.notify()` for the user who started the import) |

Consumes (through the M12 event bus, `OnDomainEvent`): from M20 `supplier.invited` → `platform_status = invited`; `supplier.linked` → `linked`; `supplier.unlinked`, `supplier.invite.expired`, `supplier.invite.cancelled`, `supplier.invite.declined` → `off_platform`; from M09 (`corrective-actions`) `cap.suspension_decided` → set or clear the suspension (§7). Audit: every create, update (diff without notes text), archive, restore, suspension change, bulk action, import confirm, contact erasure.

## 11. Migration from legacy

- `externalSupplier` → `suppliers(platform_status='off_platform')`: `supplierName` → `legal_name`; `supplierCategory` → `category_code` via the reviewed mapping table owned by M13 (`seed/category-legacy-map.ts`; unmapped → `null` + tag `legacy-category:<text>`); `supplierCategoryCoverage`, `engagementStatus`, `assesmentPlatformMethod`, `assesmentResult` → `notes` block; `supplierEmail`, `name`, `phone` → primary contact; `isHighConcern` → `high_concern`; `compliance` → `compliance_status` (`Pending` → `pending`, `Compliant` → `compliant`, `Noncompliant` → `non_compliant` **only if** the record's audit trail shows an explicit change, else `not_assessed`, because `Noncompliant` was the default); country from the contact's domain is **not** guessed: `country_code` required → set to the buyer company's country with tag `legacy-country-unverified`.
- `supplierRequest` → `suppliers(platform_status='off_platform')` + an expired invite in M20 (tokens are not migrated).
- `company.suppliers[]` / `agency.partners[]` → `suppliers(platform_status='linked')` (M20 creates the link and access rows, M10 §11).
- `legacy_ref` keeps the Mongo id; golden-master: counts per company before/after.

## 12. Test plan

- Engine: table-driven + property tests for `tier` (no cycles, depth ≤ 5, subtree recompute), `normalise`, `match` (order of keys), `import-rows` (synonyms, codes vs labels, parent ordering, formula escaping).
- E2e (`test/supplier-register-*.e2e-spec.ts`): CRUD + duplicate + version conflict, sites/contacts with one primary, archive/restore incl. cascade, bulk, import preview → confirm → summary (worker in-process), another workspace → 404, viewer → 403 on writes, no entitlement → 403 `entitlement_required`, RLS isolation for every table in `test/tenancy-rls.e2e-spec.ts`.
- Frontend: MSW page tests for loading/empty/error of register, detail and import; component tests for filter chips (URL sync) and bulk bar; Playwright `e2e/supplier-register.spec.ts` (add, import, archive) with axe.

## 13. Open questions

1. **Entitlement name.** Rename the M01/M02 module `supply_chain` to `due_diligence`, or add `due_diligence` next to it? _Recommended: rename (one module for all DD buyer features, `ranking` stays a separate add-on); migrate existing `supply_chain` entitlements._
2. **Sorting and filtering by risk band** need data the register does not own. _Recommended: phase A filters by risk band through the risk API (`GET /companies/:cid/risk/scores?band=` returns supplier ids, passed to `GET /suppliers?ids=`, ≤ 200 per page); if customers need server-side sort by risk on large registers, add an event-fed projection `supplier_register_facts` (from `supplier.risk.changed`), never a join._
3. **Spend band currency.** Bands are in the buyer company's reporting currency. _Recommended: yes, with the currency shown next to the band; no FX conversion._
4. **Column mapping step in the import** (map arbitrary headers) or fixed template only? _Recommended: template + header synonyms in phase A; a mapping step later if support tickets show the need._
5. **Max tier depth 5.** _Recommended: 5 (LkSG/CSDDD rarely go beyond tier 3; the tier flow chart shows 1–3 and groups 3+)._
6. **Buyer-specific categories or criticality scheme** (M13 §4 leaves tenant-specific reference data to this module). _Recommended: phase A uses the global M13 category taxonomy and the fixed `low|medium|high` criticality; a buyer settings table (`supplier_register_settings`: custom category labels mapped to global codes, criticality definitions) follows when a customer asks, without changing the risk inputs._

## 14. Module contract

Filled by `/module-contract` (`06-modular-build.md` §2.1, §3). Folder: `src/modules/supplier-register/` · `src/features/supplier-register/` · Wave: 2

| | |
| --- | --- |
| Owns | Tables `suppliers`, `supplier_sites`, `supplier_contacts`, `supplier_imports`, `supplier_import_rows` (RLS by `workspace_id`); routes `/v1/suppliers*`, `/v1/supplier-tags`, `/v1/supplier-imports*`; permissions `supplier:read` (new), `supplier:manage`; entitlement `due_diligence`; BullMQ queue `supplier-import`; i18n namespace `supplier-register`; FE routes `/suppliers`, `/suppliers/import`, `/suppliers/:id/*`, company tab `/companies/:id/suppliers` |
| Public surface (`index.ts`) | `SupplierRegisterModule`; `SupplierRegisterService.getSupplier(workspaceId, id)` → `SupplierReadModel \| null` (portal, risk, questionnaires, evidence, audits, grievances, esg-data); `listSuppliers(workspaceId, filter: SupplierFilter)` → page of `SupplierSummary` (screening, dd-reporting, questionnaires campaign targeting); `getSuppliersByIds(workspaceId, ids)` (risk, screening batch reads); `listSites(workspaceId, supplierId)` → `SupplierSiteReadModel[]` (dd-audits, risk); `primaryContact(workspaceId, supplierId)` → `SupplierContactReadModel \| null` (portal invites, questionnaires recipients, evidence requests, audits, CAPs); `SupplierEvents`; types `SupplierReadModel`, `SupplierSummary`, `SupplierFilter`, `SupplierSiteReadModel`, `SupplierContactReadModel`, `PlatformStatus`, `Criticality`. FE `index.ts`: `supplierRegisterRoutes`, `supplierDetailRoute(extraTabs)` (router composes other features' supplier tabs), `companySuppliersRoute` (tab route child for the companies layout, `handle.tab`), `SupplierPicker` (combobox reused by questionnaires, audits, grievances) |
| Depends on | `workspaces` (company read model by id, `due_diligence` entitlement — planned exports; fake `__tests__/fakes/workspaces.fake.ts`), `reference-data` (`ReferenceLookup.country/sector/category/isActive`, M13 §14; fake `reference-data.fake.ts`), `files` (import file read model + stream by id, M14; fake `files.fake.ts`), `audit` (`AuditService`, real), `notifications` (`EventBus.publish`, `OnDomainEvent`, `notify()`, M12 §14; fake `notifications.fake.ts`). FE: generated hooks of `suppliers`, `supplier-imports`, `files` (upload), `reference`, and read hooks of risk (`GET /v1/companies/:cid/risk/scores?supplierIds=` with `delta`, M22 §8, needs `risk:read`) and questionnaires (`GET /v1/companies/:cid/questionnaire-progress?supplierIds=`, M21 §8, needs `questionnaire:read`) once their APIs exist |
| Emits | `supplier.created`, `supplier.updated`, `supplier.archived`, `supplier.restored`, `supplier.import.completed` (payloads §10) |
| Consumes | `supplier.invited` → status `invited`; `supplier.linked` → `linked`; `supplier.unlinked`, `supplier.invite.expired`, `supplier.invite.cancelled`, `supplier.invite.declined` → `off_platform` (all from `supplier-portal`); `cap.suspension_decided` (`corrective-actions`) → set/clear suspension |
