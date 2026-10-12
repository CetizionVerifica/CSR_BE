# Reference data (M13 §3.3 · SD14)

> Spec: `docs/revamp/modules/M13-platform-admin-content.md` §3.3, §4, §5, §14 · Status: Draft · Wave: 1

## Purpose

Global lists and indices that every due diligence module looks up, and the global questionnaire template library: countries, sectors, supplier categories, risk index sources with their imported values by year, and versioned questionnaire templates. Platform owners maintain them; every signed-in user reads the lists. Not tenant data: no `workspace_id`, no RLS.

## Owns

- Tables (planned, `prisma/schema.prisma`): `countries`, `sectors` (both moved from `workspaces`, `sectors` gains `retired_at`), `categories`, `risk_index_sources`, `risk_index_imports`, `risk_index_values`, `questionnaire_templates` (M13 §4). Scores and values are `numeric`.
- Routes (M13 §5.2): `GET /v1/reference/{countries,sectors,categories,risk-index-sources}`, `GET /v1/reference/questionnaire-templates[/:code/versions/:version]` (`@Authenticated()`); `/v1/platform/reference/*` writes (`@Can('reference:manage')`).
- Permission: `reference:manage` (new in `identity/engine/permissions.ts`; `platform_owner` holds it through `platform:*`, no workspace role).
- Seed: `prisma/seed/reference.ts` (countries, sectors; categories once M13 §13.2 is answered). Risk index values are never seeded: platform owners import them.
- Events/audit actions: `ReferenceEvents` in `events.ts` (planned): `reference.updated`, plus audit actions `reference.{sector,category,country}.changed`, `reference.risk_index.imported|published|discarded`, `reference.template.created|updated|published|retired`.

## Public surface (`index.ts`)

| Export (planned)                                                                                              | Why others need it                                                                                    |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `ReferenceDataModule`                                                                                         | Registered in `app.module.ts`                                                                         |
| `ReferenceDataService.country/sector/category(code)`                                                          | Read model or `null`; `workspaces` and `supplier-register` show labels and validate codes             |
| `ReferenceDataService.isSelectable(kind, code)`                                                               | Exists and not retired: consumers reject retired codes on new records                                 |
| `ReferenceDataService.riskIndexSources()`                                                                     | Scale, direction, dimension, topic: `risk` engine normalisation inputs                                |
| `ReferenceDataService.indexValues({ source, year })`, `latestIndexYear(source, atOrBefore)`                   | Published batch with `importId` and decimal-string values; `risk` records `importId` with each result |
| `ReferenceDataService.publishedTemplate(code, version?)`, `publishedTemplates(purpose?)`                      | `questionnaires` pins `code` + `version` when a workspace starts from the library                     |
| `questionnaireTemplateDefinition`, `QuestionnaireTemplateDefinition`                                          | Same Zod rules for workspace copies in `questionnaires`                                               |
| `ReferenceEvents`                                                                                             | Event and audit action names                                                                          |
| `CountryRef`, `SectorRef`, `CategoryRef`, `RiskIndexSourceRef`, `RiskIndexValues`, `QuestionnaireTemplateRef` | Read-model types, never Prisma rows                                                                   |

## Depends on

`audit` (`AuditService.record`, in the write transaction). `localisation` (M15 §14): `TranslationsService.upsertSource` when a label or template text is written, `TranslationsService.resolve` + `resolveLocale` on reads, so lists and templates come back in the caller's locale with fallback; fake `__tests__/fakes/translations.fake.ts` (planned) returns the English source until `localisation` lands. Identity only through the global guard and the permission matrix.

## Events

Emits `reference.updated` → `{ kind: 'country' | 'sector' | 'category' | 'risk_index' | 'questionnaire_template', code, version?, year?, importId? }` on every upsert, retire and publish. Until the M12 event bus exists it is recorded as the audit action only; consumers read on demand. Consumes `translation.updated` (no reaction needed while reads resolve on demand).

## Components & behaviour

- `reference.controller.ts` — moved from `workspaces` with the **same class name `ReferenceController`, tag `reference` and method names**, so operation ids and the generated FE hooks (`useReferenceControllerSectors`, …) do not change; `Cache-Control: private, max-age=86400` on list routes. Adds `categories`, `risk-index-sources`, `questionnaire-templates`.
- `platform-reference.controller.ts` — `@Can('reference:manage')` writes for lists, index sources, imports and templates.
- `reference-data.service.ts` — public queries above and list maintenance (upsert, relabel, retire; countries: region only). Every write audited.
- `risk-indices.service.ts` — import a batch from JSON rows (≤ 5 000) as `draft`, validate with `import-validation.ts`, preview (unknown codes, missing subjects, change vs the published batch), publish (previous published batch of the same source and year becomes `superseded` in the same transaction), discard drafts. Never computes a risk score.
- `import-validation.ts` — pure: rejects unknown subject codes, duplicates, values outside `[scale_min, scale_max]`, non-numeric values; returns problem+json field errors with row numbers. Table-driven + property-based tests.
- `templates.service.ts` — draft CRUD, publish (immutable), retire, `new-version` (copies the latest version into a new draft with `version + 1`). Definition validated by `dto/template-definition.ts` (`questionnaireTemplateDefinition`).
- `reference.repository.ts` — the only Prisma access for these tables (moved `ReferenceRepository` + new methods).

## Invariants

- At most one `published` import per (source, year); published values and published template definitions never change (409 `conflict` on edit).
- Retired list entries stay readable; only `isSelectable` filters them.
- No score, weight or band is computed here; values are stored as `numeric` and returned as decimal strings.
- The moved routes keep their M02 response shapes and operation ids.

## Tests

Planned: `import-validation.spec.ts` + `import-validation.property.spec.ts`, `dto/template-definition.spec.ts`; e2e `test/reference-data.e2e-spec.ts` (US-13-1 … US-13-6: lists, 403 for workspace roles, import preview + publish + supersede, 409 on published edits, template versions). Seed assertions stay in `prisma/seed/reference.spec.ts`. Add `M13` to `spec-coverage.json` with waivers for the M13 parts outside §3.3 when this module is built.

## Not here

ISO 26000 taxonomy and KCs (M04, already seeded in `prisma/seed/taxonomy.ts`), workspace questionnaire templates, campaigns and answer scores (`questionnaires`), risk scores and their normalisation (`risk`), the `translations` table and translation workflow (`localisation`, M15), help centre, legal, feature flags and platform operations (rest of M13), file uploads (`files`).
