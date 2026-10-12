# Supplier risk (M22 · SD06)

> Spec: `docs/revamp/modules/M22-risk.md` · Status: Draft · Wave: 2 (`engine/`, pure) · 3 (service, read models, routes)

## Purpose

Computes, stores and explains each supplier's **inherent** risk (country index × sector risk × criticality) and **residual** risk (after questionnaire, evidence, audit and corrective-action facts, plus an optional external ESG rating as a separate factor) for buyer workspaces, and serves the read models behind the risk view, the supplier register's risk meter, screening and due diligence reports. Formulas: `engine/CLAUDE.md`.

## Owns

- Tables (all with `workspace_id`, RLS `ENABLE` + `FORCE`, policy on `app_current_workspace()`): `risk_settings`, `risk_subjects`, `risk_facts`, `supplier_risk`, `supplier_risk_history` (append-only), `risk_snapshots` (M22 §6). FKs only to `workspaces`, `companies`, `users`; `supplier_id` is a plain `uuid`.
- Routes (M22 §8), every one with entitlement `due_diligence`:
  - `GET /v1/suppliers/:sid/risk`, `GET /v1/suppliers/:sid/risk/history` — `@Can('risk:read')`
  - `POST /v1/suppliers/:sid/risk:recompute` — `@Can('risk:configure')`, `Idempotency-Key`, 202
  - `GET /v1/companies/:cid/risk/{scores,summary,heatmap,by-category,trend,drivers}` — `@Can('risk:read')`
  - `GET /v1/workspaces/current/risk-settings` — `@Can('risk:read')`; `PUT` — `@Can('risk:configure')`
- Permissions to add to `PERMISSIONS` (`src/common/auth/decorators.ts`) and the M01 matrix (`identity/engine/permissions.ts`): `risk:read` (owner, admin, viewer, auditor, partner_admin), `risk:configure` (owner, admin, partner_admin); both → module `due_diligence` in `PERMISSION_MODULE` (module added to `MODULES` by M02).
- BullMQ queue `risk` (processors registered in `src/worker.ts`); repeatables: nightly sweep 02:00 UTC, monthly snapshot on the 1st 01:00 UTC.
- Event/audit constants `RiskEvents` in `events.ts` (planned): `supplier.risk.changed`, `risk_settings.updated`, `risk.recompute_requested`.

## Public surface (`index.ts`, planned)

| Export                                                                     | Why others need it                                                                        |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `RiskModule`                                                               | Registered in `app.module.ts` / `worker.ts`                                               |
| `RiskQueries.riskOf(workspaceId, supplierId)` → `SupplierRiskView \| null` | `monitoring`, `dd-reporting` per-supplier sections                                        |
| `RiskQueries.risksFor(workspaceId, supplierIds)` → `SupplierRiskView[]`    | `screening` risk-band filter and column; batches of ≤ 1000                                |
| `RiskQueries.heatmap(workspaceId, companyId)` → `RiskHeatmapView`          | `dd-reporting` PDF uses the same numbers as the screen                                    |
| Types `SupplierRiskView`, `RiskBand`, `RiskBands`, `RiskHeatmapView`       | Read models (never Prisma rows)                                                           |
| `RiskEvents`                                                               | Consumers subscribe by constant                                                           |
| `bandOf(score, bands)`                                                     | Pure helper from `engine/bands.ts`, so reports band numbers with the workspace thresholds |

## Depends on

| Module              | Uses                                                                                                                                                                                          | Fake (`__tests__/fakes/`, planned)      |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `reference-data`    | `ReferenceLookup.countryRiskIndex(countryCode, year?)`, `sectorRisk(sectorCode)`, `categories()`, `regions()`, `regionOf(countryCode)` (planned M13 §14)                                      | `reference-data.fake.ts`                |
| `supplier-register` | `SupplierRegisterService.getSupplier(workspaceId, id)`, `getSuppliersByIds(workspaceId, ids)` — backfill of `risk_subjects` (company, country, sector, category, criticality, tier, archived) | `supplier-register.fake.ts`             |
| `workspaces`        | entitlement `due_diligence` (guard), company read model for `:cid` checks                                                                                                                     | — (e2e seeds kernel tables)             |
| `notifications`     | `EventBus.publish`, `@OnDomainEvent`, `notify()` on band → High                                                                                                                               | `notifications.fake.ts` (in-memory bus) |
| `audit`             | `AuditService.record`                                                                                                                                                                         | real module                             |

Facts from `questionnaires`, `supplier-evidence`, `dd-audits`, `corrective-actions`, `esg-data` arrive **only as events** — risk imports none of them.

## Events

- Emits `supplier.risk.changed` `{ workspaceId, companyId, supplierId, inherent, residual, band, previousResidual, previousBand, trigger, computedAt }` — only when a score, band or the set of factor codes changes.
- Consumes (handler → `risk_facts` upsert keyed `(workspace_id, kind, source_ref)` → enqueue recompute):

| Event (emitter)                                                                             | Reaction                                                                                                                                                        |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supplier.created`, `supplier.updated` (supplier-register)                                  | Upsert `risk_subjects`; recompute only if country, sector, category, criticality or tier changed                                                                |
| `supplier.archived`, `supplier.restored` (supplier-register)                                | Mark / unmark subject + `supplier_risk.archived`; drop from / add to aggregates                                                                                 |
| `questionnaire.reviewed` (questionnaires), `decision = 'accepted'`                          | Questionnaire fact `{ templateKey, scoreOverall, criticalFlags, decidedAt }`; the previous accepted one of the same template → `superseded`; `returned` ignored |
| `certificate.verified` (supplier-evidence)                                                  | Evidence fact `{ documentId, certificateTypeCode, validUntil }`; `certificate.expired`, `.rejected`, `.superseded` close it                                     |
| `dd_audit.completed`, `finding.raised`, `finding.withdrawn`, `finding.closed` (dd-audits)   | Audit fact `{ source, result, completedAt }` (`legacy_flag` ignored); finding fact `{ severity }` opened / closed                                               |
| `cap.overdue`, `cap.closed`, `cap.cancelled`, `cap.suspension_decided` (corrective-actions) | CAP fact open (per `capId`) / closed; `cap.closed.findingIds[]` also close those finding facts; suspension fact (0 points)                                      |
| `external_rating.updated` (esg-data)                                                        | External fact `{ provider, month, overall, asOf }`                                                                                                              |
| `reference.updated` (reference-data, kind risk index / sector risk)                         | Batched recompute of every entitled workspace (per-workspace jobs, each inside `withTenant`)                                                                    |

## Components & behaviour

- `engine/` (wave 2) — pure formulas, see `engine/CLAUDE.md`. Built and merged first, with fixtures only.
- `risk-facts.consumer.ts` (planned) — one handler per consumed event; validates payload with Zod, ignores events of non-entitled workspaces, upserts idempotently (replayed events are no-ops), enqueues `recompute` with job id `ws:<id>:sup:<id>` (dedupe).
- `risk.processor.ts` (planned, worker) — `recompute(workspaceId, supplierId, trigger)`: loads subject (falls back to `getSupplier` when missing), index values, active facts and settings; calls `engine/assess`; writes `supplier_risk`, appends `supplier_risk_history`, emits the event, calls `notify()` when the band becomes `high`. `recomputeWorkspace` fans out per supplier. `sweep` (nightly) re-evaluates suppliers whose facts expired since the last run. `snapshot` (monthly) writes `risk_snapshots` per company.
- `risk.service.ts` (planned) — read models for the routes; settings update validates bands via `engine/validateBands`, writes the `risk_settings.updated` audit entry with diff, enqueues `recomputeWorkspace`.
- `risk.repository.ts` (planned) — the only Prisma access; all in `prisma.withTenant`; the cross-workspace fan-out for `reference.updated` lists entitled workspaces through `workspaces`' exported query, never by disabling RLS.
- `risk.controller.ts` (planned) — HTTP only; responses always include `bands`; a supplier never computed returns `status: 'pending'`.

## Invariants

- No score is computed outside `engine/`, and no route accepts a score, band or factor from the client.
- Every response that carries a score also carries the workspace's `bands`; bands are never hard-coded in consumers.
- `supplier_risk_history` is append-only (no update/delete in the repository).
- The same inputs and `ENGINE_VERSION` always produce the same result (no clock inside the engine; `today` is passed in).
- Another workspace's supplier or company id answers 404; supplier workspaces never read a buyer's risk.
- Risk reads no table of another module; facts are copies taken from event payloads.

## Tests

- Unit: `engine/*.spec.ts`, `engine/risk.property.spec.ts`, golden fixtures `test/fixtures/golden/risk/` (planned).
- E2e (planned): `test/risk-scores.e2e-spec.ts` (US-22-1, US-22-2, US-22-3, US-22-6), `test/risk-read-models.e2e-spec.ts` (US-22-4, US-22-8), `test/risk-history-settings.e2e-spec.ts` (US-22-5, US-22-7), `test/risk-tenancy.e2e-spec.ts` (US-22-9: 404 cross-workspace, RLS on all six tables, forbidden role, missing entitlement 403).
- Events are driven through the in-memory bus fake; add `risk` to `spec-coverage.json` when implemented.

## Not here

Supplier records and attributes (`supplier-register`), index values and taxonomies (`reference-data`), questionnaire scores (`questionnaires`), certificate verification (`supplier-evidence`), findings (`dd-audits`), CAPs (`corrective-actions`), ESG rating fetching and matching (`esg-data`), tiers A–D and conformity (`screening`), alerts, sanctions and the signal feed (`monitoring`), PDFs (`dd-reporting`).
