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
- Translations per content item & language with status (missing/machine/reviewed); export/import XLIFF or XLSX for translators (M15).
- Custom question packs per workspace (Phase 4): workspace-scoped additions to the library, never altering the global library.

## 4. Domain model (additions; content tables themselves are defined in M04/M08/M09/M16)
```ts
content_versions { id, content_type, key, version, status: 'draft'|'in_review'|'published'|'retired', payload jsonb?, created_by, reviewed_by?, published_by?, published_at? }
translations     { id, content_type, content_id, field, locale, text, status: 'missing'|'machine'|'reviewed', updated_by, updated_at, unique(content_type, content_id, field, locale) }
help_articles    { id, slug, category, context_keys text[], status, current_version_id }
legal_documents  { id, type, version, locale, file_id?, body_md?, effective_at, requires_reacceptance boolean }
feature_flags    { key pk, description, default_on boolean }
feature_flag_overrides { key, workspace_id, on boolean }
announcements    { id, title, body_md, audience, published_at, expires_at? }
```

## 5. API contract (REST `/v1/platform/*`, all platform roles; content read endpoints public to authenticated users)
`GET/PATCH /platform/workspaces[/:id]`, `PUT /platform/workspaces/:id/entitlements`, `GET/PATCH /platform/users[/:id]`, `POST /platform/users/:id/impersonate`, `GET/POST/PATCH /platform/content/:type[/:id]`, `POST /platform/content/:type/:id/publish`, `GET/PUT /platform/translations`, `GET/POST /platform/feature-flags`, `GET /help/articles?context=` (authenticated), `GET /legal/:type/current`.

## 6. UI
Separate **Admin** area (`/admin`, dark-accented header "Platform admin" to avoid confusion with tenant settings): Workspaces · Users · Assessors · Content (Taxonomy, Surveys, Checklists, KPIs, Frameworks, Reference lists) · Translations · Help centre · Legal · Flags · Queues · Announcements. Content editors use a tree + form editor with version history and diff.

## 7. Migration & seeding
`prisma/seed/` scripts parse the legacy content files listed in §3.2 into the new tables (idempotent, versioned `ISO26000-v3`), with assertions: 7 core subjects, 41 issues (5/8/5/4/5/7/7), 609 KCs (OG 42, HR 105, LP 103, ENV 74, FOP 87, CI 142, CID 56), 25 header rows, English labels complete; existing ar/de/fr/ro translation strings imported where keys match (legacy files still use v1 KC keys → match by English text, mark `machine`/unreviewed).

## 8. Test plan
Seed assertions in CI; four-eyes publish rule; impersonation audit; content version pinning (a project started on v3 keeps v3 after v4 publish).
