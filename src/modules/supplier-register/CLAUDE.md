# Supplier register (M19 · SD02)

> Spec: `docs/revamp/modules/M19-supplier-register.md` · Status: Draft · Wave: 2

## Purpose

The buyer's single list of suppliers: one record per supplier legal entity per buyer company, with sites, contacts, classification (country, sector, category, criticality, spend band), supply-chain tier (direct or sub-supplier), tags and platform status. Every other due diligence module references these records by id and reads them through this module's exported queries.

## Owns

- Tables (all `workspace_id` = buyer, RLS `ENABLE` + `FORCE` with `app_current_workspace()`, migration `<ts>_rls_supplier_register_tables`): `suppliers`, `supplier_sites`, `supplier_contacts`, `supplier_imports`, `supplier_import_rows` (M19 §6; `suppliers` includes the suspension projection `suspended_at`, `suspension_reason`, `suspension_cap_id`). FKs only to `workspaces`, `companies`, `users`, `files`, reference `countries`/`sectors`/`supplier_categories`, and inside the module (`parent_supplier_id`, `supplier_id`, `import_id`).
- Routes `/v1/suppliers*`, `/v1/supplier-tags`, `/v1/supplier-imports*` (M19 §8). There is **no** `DELETE /suppliers/:id`.
- Permissions: `supplier:read` (new, add to `identity/engine/permissions.ts` + `PERMISSIONS`: owner, admin, partner_admin, contributor, viewer, auditor) and `supplier:manage` (exists). Both mapped to entitlement `due_diligence` in `PERMISSION_MODULE` (M19 §13 Q1: replaces `supply_chain`).
- BullMQ queue `supplier-import` (validate and import processors, registered in `src/worker.ts`).
- Events/audit actions: `SupplierEvents` in `events.ts` (planned).

## Public surface (`index.ts`)

| Export (all planned)                                                                                                                                                   | Why others need it                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `SupplierRegisterModule`                                                                                                                                               | Registered in `app.module.ts`; imported by modules injecting the service         |
| `SupplierRegisterService.getSupplier(workspaceId, id)` → `SupplierReadModel \| null`                                                                                   | portal, risk, questionnaires, supplier-evidence, dd-audits, grievances, esg-data |
| `listSuppliers(workspaceId, filter: SupplierFilter)` → cursor page of `SupplierSummary`                                                                                | screening, dd-reporting, questionnaires campaign targeting, risk recompute-all   |
| `getSuppliersByIds(workspaceId, ids)` → `SupplierSummary[]`                                                                                                            | risk, screening batch reads                                                      |
| `listSites(workspaceId, supplierId)` → `SupplierSiteReadModel[]`                                                                                                       | dd-audits (on-site audits), risk                                                 |
| `primaryContact(workspaceId, supplierId)` → `SupplierContactReadModel \| null`                                                                                         | portal invites, questionnaires and evidence requests                             |
| `SupplierEvents`, types `SupplierReadModel`, `SupplierSummary`, `SupplierFilter`, `SupplierSiteReadModel`, `SupplierContactReadModel`, `PlatformStatus`, `Criticality` | Event names and read-model types; never Prisma rows                              |

Read models exclude archived suppliers unless `includeArchived: true`; a missing or other-workspace id returns `null`, never throws.

## Depends on

- `workspaces`: company read model by id (buyer company exists, not deleted) and the `due_diligence` entitlement check — planned exports; fake `__tests__/fakes/workspaces.fake.ts`.
- `reference-data` (M13 §14): `ReferenceLookup.country/sector/category/isActive` to validate codes; fake `__tests__/fakes/reference-data.fake.ts`.
- `files` (M14): import file read model (`status = ready`, purpose `import`) and a read stream; writes the errors CSV as a `report`-purpose file; fake `__tests__/fakes/files.fake.ts`.
- `notifications` (M12 §14): `EventBus.publish(event, tx)`, `@OnDomainEvent` handlers, `notify()` for "import finished"; fake `__tests__/fakes/notifications.fake.ts` (in-memory bus).
- `audit`: `AuditService.record(entries, meta, tx)` (real).

## Events

- Emits (payloads M19 §10): `supplier.created`, `supplier.updated` (with `changed[]` and the risk-relevant fields), `supplier.archived`, `supplier.restored`, `supplier.import.completed`.
- Consumes (from `supplier-portal`): `supplier.invited` → `platform_status = 'invited'`; `supplier.linked` → `'linked'`; `supplier.unlinked`, `supplier.invite.expired|cancelled|declined` → `'off_platform'`. From `corrective-actions`: `cap.suspension_decided { decision: 'suspend' | 'lift', reason, capId }` → set/clear `suspended_at`, `suspension_reason`, `suspension_cap_id` and emit `supplier.updated` (`changed: ['suspended']`). Handlers are idempotent (same status → no write, no event).

## Components & behaviour

- `suppliers.controller.ts` (planned) — HTTP only, `@Can('supplier:read' | 'supplier:manage')`, Zod DTOs in `dto/`, cursor pagination, `@ApiZod*` docs for every status (400, 403, 404, 409, 413).
- `suppliers.service.ts` (planned) — create (duplicate check via `engine/match.ts`; 409 `conflict` + `existingId` unless `allowDuplicate`), update with optimistic `version` (stale → 409), parent change recomputes the subtree tiers in one `withTenant` transaction, archive (`cascade` archives the subtree, else 409 when active children exist) and restore, bulk actions (≤ 500 ids, per-id result, one audit entry per supplier), activity feed from audit events. Rejects `platformStatus` in bodies.
- `sites.service.ts`, `contacts.service.ts` (planned) — one primary contact per supplier (setting a new primary clears the old one in the same transaction); contact DELETE hard-deletes (personal data), site DELETE sets `archived_at`.
- `imports.service.ts` + `imports.processor.ts` (planned) — `POST /supplier-imports` creates `uploaded` and enqueues `validate`; the processor streams the file (CSV via `csv-parse`, XLSX via `exceljs`), runs `engine/import-rows.ts`, stores preview rows → `preview_ready`; `confirm` (Idempotency-Key) enqueues `import`, which writes rows in chunks of 500 per transaction, tags created suppliers `import:<yyyy-mm-dd>`, emits one `supplier.created`/`updated` per row and `supplier.import.completed`. One `importing` job per company; previews expire after 24 h; rows purged 30 days after finish.
- `suppliers.repository.ts`, `imports.repository.ts` (planned) — the only Prisma access; every query in `prisma.withTenant`.
- `engine/` (planned, pure): `tier.ts` (tier from parent, cycle and depth ≤ 5 checks), `normalise.ts` (name normalisation for matching), `match.ts` (external ref → registration no. + country → normalised name + country), `import-rows.ts` (header synonyms, code-or-label resolution, parent-first ordering, formula-cell escaping). No scores here.

## Invariants

- Tenant isolation: another workspace's ids answer 404; RLS cases for all five tables in `test/tenancy-rls.e2e-spec.ts`.
- `tier = parent.tier + 1`, no cycles, depth ≤ 5, parent in the same buyer company and not archived while the child is active.
- `platform_status` changes only through the portal events; suspension only through `cap.suspension_decided` (both rejected in PATCH bodies).
- `compliance_status` defaults to `not_assessed` (legacy `Noncompliant` default is a bug, M19 §3).
- Nothing is hard-deleted except contacts (and import preview rows by retention).
- The register stores no risk score, questionnaire result or certificate; those stay in their modules.

## Tests

- Engine: `engine/*.spec.ts` (table-driven) and `engine/supplier-register.property.spec.ts` (fast-check: tiers never cycle, match order stable).
- E2e (planned): `test/supplier-register-crud.e2e-spec.ts` (US-19-1, 2, 3, 5, 6, 9, 10), `test/supplier-register-import.e2e-spec.ts` (US-19-4), `test/supplier-register-events.e2e-spec.ts` (portal events → platform status; emitted payloads). Migration golden-master (US-19-8) in the migration suite. Add the module to `spec-coverage.json` when built.

## Not here

Invites, links, sharing and the supplier profile (`supplier-portal`); risk and the risk meter values (`risk`); questionnaire progress (`questionnaires`); certificates (`supplier-evidence`); ranking, A–D tiers and conformity (`screening`); register exports for reports (`dd-reporting`); reference lists (`reference-data`).
