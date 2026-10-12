# M13 — Platform Administration & Content Library

> Status: Draft · Phase: 1 (platform users/workspaces) → 3 (content editor) · Depends on: M01, M02, M15
> Legacy code: FE `superadmin/*` (unguarded page posting to unauthenticated `/api/users`), `user/Users.js`, `agencies/*`, `surveys/SurveysList.js` (SurveyMonkey template admin), `Helps.js` (FAQ), content files `common/gapAnalysisQuestions.js`, `common/tooltips.js`, `common/csrInfo.js`, `common/enum/*`, `images/csr_analytics_pro_toolkit_handbook.pdf` · BE `helpers/seed.js`, `helpers/survey_templates/*`, `services/mappings.js`, `Docs/*`

## 1. Purpose
Operate the SaaS (workspaces, users, entitlements, assessors, support) and manage all **reference content** as versioned, translatable data: ISO 26000 taxonomy and 609 key considerations, survey templates, checklists, KPI library, frameworks & mappings (with M16), help centre, legal documents.

## 2. Users & permissions
`platform_owner` (all), `platform_support` (read-only + impersonation with reason), `content_editor` (new platform role: edit drafts of content; publishing requires `platform_owner` or a second editor — four-eyes).

## 3. Scope
### 3.1 Platform operations
- Workspaces: list/search, create, suspend/reactivate, entitlements & limits (M02), data region, usage (users, projects, storage, AI spend), notes.
- Users: search across workspaces, status, memberships, sessions, force password reset, disable, MFA reset, **impersonate** (reason required, banner, time-boxed, audited).
- Assessors: manage `platform_assessor` users, workload per assessor, SLA metrics (M05).
- System: feature flags (global & per workspace), queue dashboard (Bull Board), email suppression list, maintenance banner, announcement/changelog posts.
- Seeding: CLI `npm run seed:owner` for the first platform owner; nothing seeded on boot.

### 3.2 Content library (versioned, i18n)

| Content | Structure | Source for seeding |
|---|---|---|
| Taxonomy & question library (M04) | versions → core subjects → issues → KCs (code, legacy key, labels, evidence hint, answer type, scoring rule, group, order) | `Docs/GapAnalysisV2.xlsx`, FE `gapAnalysisQuestions.js`, BE `services/mappings.js` |
| Survey templates (M08) | versioned JSON definitions per purpose & language | `server/helpers/survey_templates/template_{internal,external}.js` (not the `* copy.js` files), FE `translationsMap.js` |
| Checklists | ISO 26000 audit checklist (4 sections, 12 items), UNGC annual review (5 sections, ~64 items) | FE `common/enum/{auditQuestions,annualReviewQuestions}.js` |
| KPI library (M09) | code, name, unit, direction, framework refs | new (CSRC content team) |
| Frameworks & mappings (M16) | framework versions, nodes, mappings | EFRAG / GRI / SEBI sources |
| Reference lists | sectors, countries/regions, stakeholder groups, units, emission factors (M18) | FE `common/enum/{companySectors,countries,countryRegions}.js` |
| Help centre | articles (markdown), categories, contextual help keys attached to screens/questions, tooltips | FE `Helps.js` (36 FAQs), `tooltips.js` (18), handbook PDF |
| Legal | terms of service, licence agreement, privacy notice, DPA — versioned; users re-accept on major version | `public/assets/user-license-agreeementV2.pdf` |

- Editing workflow: draft → review → publish (new version, immutable); diff view between versions; impact analysis ("used by N active projects"); projects keep the version they started with and can be upgraded explicitly.
- Translations per content item & language with status (missing/machine/reviewed); export/import XLIFF or XLSX for translators (M15). M13 content is translated through the `localisation` module's `TranslationsService` (`resolve`, `upsertSource`); M13 never writes the `translations` table itself.
- Custom question packs per workspace (Phase 4): workspace-scoped additions to the library, never altering the global library.

### 3.3 Reference data module (`reference-data`, SD14, wave 1)
The due diligence plan (`06-modular-build.md` §5) builds the reference part of this spec first, as its own module: the global lists and indices the DD modules look up, and the global questionnaire template library. It is contracted in §14; the rest of M13 (platform operations, taxonomy editor, help centre, legal, flags) stays here for later modules; translations belong to `localisation`. Reference-data labels and template texts register their English source with `TranslationsService.upsertSource` and are returned in the requested locale through `TranslationsService.resolve` (M15 §14).
- **Lists**: countries (ISO 3166-1 alpha-2 with region), sectors (two-level, ISIC/NACE codes), categories (goods/services taxonomy of suppliers, two-level, M10 §4.2). Platform owners add, relabel and retire sectors and categories; countries are the ISO list and only their region changes. A retired entry stays readable (old records keep pointing at it) but is no longer offered for new records.
- **Risk indices**: index sources (e.g. a governance, labour-rights or corruption index) with publisher, licence, dimension (`country` or `sector`), scale and direction; values per source, year and country/sector code, imported by a platform owner as a batch that is previewed (rows, gaps, change vs the published batch) and then published. Published batches are immutable; a new batch for the same source and year supersedes the old one, which stays stored so a risk result can name the batch it used. No risk score is computed here: the `risk` module normalises and weights the values in its engine.
- **Questionnaire template library**: global, versioned template definitions (sections, questions, answer types, options, scoring hints, purpose such as `supplier_saq`, `materiality_internal`, `materiality_external`), draft → published → retired; a published version is immutable and a change makes a new version. The `questionnaires` module copies or pins a published version into a workspace and owns campaigns and workspace templates; this library never changes a workspace's copy.
- **Moves from M02**: the `sectors` and `countries` tables, their seed (`prisma/seed/reference.ts`) and the `GET /v1/reference/{sectors,countries}` routes move from `workspaces` to `reference-data`, keeping URLs, response shapes and operation ids so the generated frontend hooks do not change.
- Content editor role and four-eyes publishing (§2) arrive with the M13 content workflow; until then publishing needs `reference:manage` (platform owner).

## 4. Domain model (additions; content tables themselves are defined in M04/M08/M09/M16)
```ts
content_versions { id, content_type, key, version, status: 'draft'|'in_review'|'published'|'retired', payload jsonb?, created_by, reviewed_by?, published_by?, published_at? }
-- translations { … } is owned by the `localisation` module (M15, catalogue `06` §5); M13 content registers its source strings with TranslationsService.upsertSource and reads them with TranslationsService.resolve.
help_articles    { id, slug, category, context_keys text[], status, current_version_id }
legal_documents  { id, type, version, locale, file_id?, body_md?, effective_at, requires_reacceptance boolean }
feature_flags    { key pk, description, default_on boolean }
feature_flag_overrides { key, workspace_id, on boolean }
announcements    { id, title, body_md, audience, published_at, expires_at? }
```

Reference data (§3.3; global, not tenant-scoped, no `workspace_id`, no RLS; foreign keys to these tables are allowed from any module as kernel reference data, `06` §3.2):
```ts
countries            { code pk char(2), region, label_key }                                          -- from M02, unchanged
sectors              { code pk, parent_code?, label_key, label, sort_order, isic_code?, nace_code?, retired_at? }  -- from M02 (+ retired_at)
categories           { code pk, parent_code?, label_key, label, sort_order, retired_at? }
risk_index_sources   { code pk, name, publisher, licence, url?, dimension: 'country'|'sector', topic, scale_min numeric, scale_max numeric, higher_is_riskier boolean, retired_at? }
risk_index_imports   { id uuid pk, source_code, year int, status: 'draft'|'published'|'superseded', row_count, created_by, created_at, published_by?, published_at? }
risk_index_values    { import_id, subject_code, value numeric, pk(import_id, subject_code) }    -- subject_code = country or sector code
questionnaire_templates { id uuid pk, code, version int, purpose, status: 'draft'|'published'|'retired', title, default_locale, definition jsonb,
                          created_by, published_by?, published_at?, unique(code, version) }
```
Invariants: at most one `published` import per (source, year); values of a published import and a published template definition never change; `definition` is validated by the exported Zod schema on every write.

## 5. API contract (REST `/v1/platform/*`, all platform roles; content read endpoints public to authenticated users)
### 5.1 User stories (reference-data, §3.3)
- **US-13-1** As any signed-in user I get the countries, sectors and categories lists (cacheable), so that forms offer the same codes everywhere.
  - AC: Given a retired sector, when I load the list, then it is returned with `retiredAt` and the API rejects it for new records of the consuming module.
- **US-13-2** As a platform owner I add, relabel and retire sectors and categories, so that the lists follow the content team without a deploy.
  - AC: Given a workspace admin, when they call a `/platform/reference/*` write route, then they get 403; every change writes an audit event and emits `reference.updated`.
- **US-13-3** As a platform owner I register a risk index source and import a year of values as a draft batch with a preview of unknown codes, gaps and changes, so that I check the data before it is used.
  - AC: Given rows with a country code that does not exist or a value outside the source scale, when I import, then the batch is rejected with problem+json field errors naming the rows.
- **US-13-4** As a platform owner I publish an import batch; it supersedes the published batch of the same source and year, so that risk recalculations use the new values and old results still name the batch they used.
  - AC: Given a published batch, when anyone tries to change its values, then the API refuses (409); `reference.updated` carries source, year and the new import id.
- **US-13-5** As a platform owner I author a questionnaire template as a draft, publish it as an immutable version and retire old versions, so that workspaces start campaigns from reviewed content.
  - AC: Given a published version, when I edit it, then the API answers 409 and offers "new version"; a definition that fails the template schema answers 400 with field paths.
- **US-13-6** As a workspace user preparing a campaign I list published templates by purpose and open a specific version, so that the questionnaires module can pin it.

### 5.2 Endpoints
`GET/PATCH /platform/workspaces[/:id]`, `PUT /platform/workspaces/:id/entitlements`, `GET/PATCH /platform/users[/:id]`, `POST /platform/users/:id/impersonate`, `GET/POST/PATCH /platform/content/:type[/:id]`, `POST /platform/content/:type/:id/publish`, `GET/PUT /platform/translations`, `GET/POST /platform/feature-flags`, `GET /help/articles?context=` (authenticated), `GET /legal/:type/current`.

Reference-data routes (§3.3, §14):

| Route | Permission |
|---|---|
| `GET /reference/countries` · `GET /reference/sectors` · `GET /reference/categories` (moved/new, `Cache-Control: private, max-age=86400`) | authenticated |
| `GET /reference/risk-index-sources` | authenticated (definitions only, no values: licences may restrict display) |
| `GET /reference/questionnaire-templates?purpose=` · `GET /reference/questionnaire-templates/:code/versions/:version` | authenticated (published versions only) |
| `PUT /platform/reference/{sectors,categories}/:code` · `POST /platform/reference/{sectors,categories}/:code/retire` · `PATCH /platform/reference/countries/:code` (region only) | `reference:manage` |
| `GET/POST /platform/reference/risk-index-sources` · `PATCH /platform/reference/risk-index-sources/:code` | `reference:manage` |
| `GET/POST /platform/reference/risk-index-sources/:code/imports` (JSON rows, ≤ 5 000) · `GET .../imports/:id` (values + preview) · `POST .../imports/:id/publish` · `DELETE .../imports/:id` (draft only) | `reference:manage` |
| `GET/POST /platform/reference/questionnaire-templates` · `GET/PATCH /platform/reference/questionnaire-templates/:id` (draft only) · `POST .../:id/publish` · `POST .../:id/retire` · `POST .../:id/new-version` | `reference:manage` |

`reference:manage` is a new permission in the M01 matrix, held by `platform_owner` (through `platform:*`); no workspace role holds it.

## 6. UI
Separate **Admin** area (`/admin`, dark-accented header "Platform admin" to avoid confusion with tenant settings): Workspaces · Users · Assessors · Content (Taxonomy, Surveys, Checklists, KPIs, Frameworks, Reference lists) · Translations · Help centre · Legal · Flags · Queues · Announcements. Content editors use a tree + form editor with version history and diff.

Reference-data screens (frontend `src/features/reference-data`, §14): `/admin/reference` with URL-synced tabs Countries · Sectors · Categories · Risk indices · Questionnaire templates; import preview for risk index batches (table of rows with unknown codes and changes vs the published batch, then Publish); template editor as a form with a read-only view of published versions. Lookups for tenant forms stay in `src/lib/reference.ts` (kernel), not in the feature.

## 7. Migration & seeding
`prisma/seed/` scripts parse the legacy content files listed in §3.2 into the new tables (idempotent, versioned `ISO26000-v3`), with assertions: 7 core subjects, 41 issues (5/8/5/4/5/7/7), 609 KCs (OG 42, HR 105, LP 103, ENV 74, FOP 87, CI 142, CID 56), 25 header rows, English labels complete; existing ar/de/fr/ro translation strings imported where keys match (legacy files still use v1 KC keys → match by English text, mark `machine`/unreviewed).

## 8. Test plan
Seed assertions in CI; four-eyes publish rule; impersonation audit; content version pinning (a project started on v3 keeps v3 after v4 publish).
- Reference data: list routes keep their M02 shapes and operation ids; `reference:manage` routes answer 403 to workspace roles; import validation (unknown codes, out-of-scale values, duplicates, > 5 000 rows) table-driven; a published batch and a published template are immutable (409); publishing a batch supersedes the previous one for the same source and year.

## 13. Open questions
Scope: the `reference-data` module (§3.3). Each has a recommended answer; the contract in §14 does not change with the answer, only the data loaded.

1. **Which risk index sources are loaded first** (also M10 §13: licensed country/sector indices, cost and licence terms)? Recommended: keep the module source-agnostic and load only openly licensed indices at first (for example the World Bank Worldwide Governance Indicators, CC BY 4.0); add ITUC, Transparency International CPI, WJP or a paid sector-risk dataset only after a licence check for commercial SaaS use and display rights, like CSRhub (SD16).
2. **Which category list seeds the goods/services taxonomy** of suppliers? Recommended: a short two-level platform list (about 15–25 top-level categories) written by the content team and maintained in the admin screen; workspace-specific groupings use supplier tags in `supplier-register`, not new categories; an external code list (e.g. UNSPSC) can be mapped later as an extra column.

## 14. Module contract
Filled by `/module-contract` (`06-modular-build.md` §2.1, §3). Folder: `src/modules/reference-data/` · `src/features/reference-data/` · Wave: 1. Scope: §3.3 only.

| | |
|---|---|
| Owns | Tables `countries`, `sectors` (both moved from M02), `categories`, `risk_index_sources`, `risk_index_imports`, `risk_index_values`, `questionnaire_templates` (§4). Routes `/v1/reference/*` and `/v1/platform/reference/*` (§5.2). Permission `reference:manage`. Seed `prisma/seed/reference.ts` (countries, sectors; categories once §13.2 is answered). i18n namespace `reference-data` (frontend); list labels through `label_key`. Event constants `ReferenceEvents`. |
| Public surface (`index.ts`) | `ReferenceDataModule` (registered in `app.module.ts`) · `ReferenceDataService`: `country(code)`, `sector(code)`, `category(code)` → read model or `null`, and `isSelectable(kind, code)` (exists and not retired), for `workspaces` (company sector/country validation) and `supplier-register` (supplier country/sector/category) · `riskIndexSources()` → definitions with scale and direction, and `indexValues({ source, year })` → `{ importId, source, year, values: { subjectCode, value: string }[] } \| null` (latest published batch for that year; `value` is a decimal string), plus `latestIndexYear(source, atOrBefore)`, for `risk` (inherent risk inputs, records `importId`) · `publishedTemplate(code, version?)` and `publishedTemplates(purpose?)` → template read model, for `questionnaires` (pins `code` + `version`) · `questionnaireTemplateDefinition` (Zod schema) and its type, so `questionnaires` validates workspace copies with the same rules · `ReferenceEvents` · read-model types `CountryRef`, `SectorRef`, `CategoryRef`, `RiskIndexSourceRef`, `RiskIndexValues`, `QuestionnaireTemplateRef`. Frontend `index.ts`: route objects only. |
| Depends on | `audit` (`AuditService.record` for every write; fake: none needed, the real module is built) · `localisation` (`TranslationsService.upsertSource` when a label or template text is written, `TranslationsService.resolve` + `resolveLocale` on reads; fake in `__tests__/fakes/translations.fake.ts` returning the English source until `localisation` is built) · `identity` only through the global auth guard and `@Can('reference:manage')` (permission added to the M01 matrix). No other module; reference data is kernel data that others depend on. |
| Emits | `reference.updated` → `{ kind: 'country' \| 'sector' \| 'category' \| 'risk_index' \| 'questionnaire_template', code, version?, year?, importId? }`, on every upsert, retire and publish. Until the M12 event bus exists it is recorded as the audit action and no module needs it synchronously (`risk` recomputes on its next run; `questionnaires` shows new versions on its next read). |
| Consumes | `translation.updated` → none needed now (reads resolve on demand); listed so a cache added later is invalidated by it. |
