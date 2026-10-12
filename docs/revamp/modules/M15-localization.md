# M15 — Localisation (UI, content, RTL)

> Status: Draft · Phase: 1 (framework) → 2 (content translations) · Used by: all modules
> Legacy code: FE `src/translations/{en,ar,de,fr,ro}.json` (en 761 keys; ar/de/fr ~751; de/fr/ro 105–154 still English), `src/messages/*`, `common/enum/languages.js` (**only `en` enabled**), `common/withDirection.js` (RTL broken), `components/surveys/template/translationsMap.js` (separate English/Greek survey system)

## 1. Purpose

Every user-facing string (UI, emails, reports, reference content, survey questions) is translatable and nothing is hard-coded (legacy: ~317 hard-coded English strings, English-only KC texts and chart titles). English is the source language; further languages are added as **data, with no code change**, and Arabic gets full **RTL** support. Users are everyone: workspace members see the UI in their language, survey respondents and suppliers in theirs, platform owners and translators maintain the translations.

## 2. Users & permissions

| Role                                          | Can                                                                                                        |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Anyone (public)                               | List the enabled locales (`GET /v1/locales`), e.g. for the sign-in and survey language pickers             |
| Any signed-in user                            | Choose their own locale (profile, M01 `PATCH /v1/me`); read content in the resolved locale (owning module) |
| Workspace owner/admin                         | Set the workspace default locale (M02)                                                                     |
| Platform owner (`platform:*`)                 | Enable/disable locales, list, edit, review and export content translations (`translation:manage`)          |
| Translator (planned platform role, see §13 Q3) | `translation:manage` limited to the locales they are assigned                                              |

## 3. Current state (legacy)

- UI strings in `src/translations/*.json` (keys differ from the new semantic keys); `common/enum/languages.js` enables only `en`, so the other files were never shipped.
- `common/withDirection.js` toggles RTL but layout uses physical CSS, so Arabic is broken.
- Content (KC texts, survey templates, chart titles) is English-only in JS files; surveys have a separate English/Greek map (`translationsMap.js`).

## 4. Scope

### 4.1 Must have (parity + fixes)

- **UI strings**: i18next + ICU MessageFormat; namespaces per feature (`common`, `auth`, `gap`, `materiality`, …) lazy-loaded; keys are semantic (`gap.question.relevance.label`), extracted with `i18next-parser`; CI fails on missing keys in `en` and reports coverage for other locales (warning, not failure).
- **Formatting**: `Intl.NumberFormat`, `Intl.DateTimeFormat`, `Intl.RelativeTimeFormat`, `Intl.PluralRules`; units via unit table (M09/M18).
- **RTL**: `<html lang dir>` set on locale change; Tailwind logical utilities only (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`), lint rule forbids `ml-/mr-/pl-/pr-/left-/right-` in `src/`; directional icons mirrored via `rtl:` variant; charts: axis/legend mirrored where meaningful, numbers stay LTR (`dir="ltr"` spans); Arabic font loaded only for `ar`.

### 4.2 New in the revamp

- **Locale registry** (`locales` table): which languages exist, their direction and whether they are enabled for the UI and for content. Enabling a language is a data change.
- **Content strings** (taxonomy, KCs, templates, checklists, help, risk-topic labels): stored in the `translations` table owned by this module and returned by the owning module's API in the requested locale with English fallback + `fallback: true` flag, so the UI can mark untranslated text.
- **Emails & reports**: rendered server-side in the recipient's/report's locale from ICU catalogues in the backend `locales/<lang>/<namespace>.json` folder; each module owns its namespace file, this module owns the formatter.
- **Locale resolution**: user profile → workspace default → browser `Accept-Language` → `en`. Public survey / supplier portal: recipient language → browser → campaign default → `en`.
- **Translation workflow**: list and edit translations per content type and locale with statuses `missing | machine | reviewed`; export XLIFF/XLSX per content type and locale.

### 4.3 Out of scope

- **Import** of translated XLIFF/XLSX files: a follow-up increment that takes the uploaded file through the `files` module (presigned upload + scan, M14) and runs in a worker; it adds `files` to this module's dependencies when it is built.
- **Machine pre-translation** (DeepL or Claude, M17): later; it writes rows with status `machine` through this module's service.
- Translating **workspace-authored** content (custom questions, custom templates): stored in the author's language; revisit after launch.
- Choosing the launch languages: a data decision (§13 Q1), not code.

## 5. User stories & acceptance criteria

- **US-15-1** As a visitor, I want to see the languages the product offers, so that I can pick mine before signing in.
  - AC: `GET /v1/locales` (public, rate-limited) returns enabled locales with `code`, `name`, `nativeName`, `dir`; disabled locales are not listed; `en` is always enabled.
- **US-15-2** As a user, I want the app, emails and reports in my language, falling back sensibly, so that I never get a blank or broken string.
  - AC: `resolveLocale` picks the first enabled candidate of user → workspace → `Accept-Language` (quality order, language-only match) → `en`; an unknown or disabled locale is skipped; result is always an enabled locale.
- **US-15-3** As a user reading reference content, I want untranslated text to be marked, so that I know I am seeing the English source.
  - AC: `TranslationsService.resolve` returns for each requested `(contentType, contentId, field)` the text in the requested locale when a `machine` or `reviewed` row exists, else the `en` source with `fallback: true`; `missing` rows count as absent.
- **US-15-4** As a recipient of an email or report, I want it rendered in my locale, so that I can read it.
  - AC: `MessageCatalogue.format(locale, 'ns:key', values)` formats ICU (plurals, select, numbers, dates) in `locale`, falls back key-by-key to `en`, and fails a test when a key is missing in `en`.
- **US-15-5** As a platform owner, I want to enable or disable a language, so that adding a language needs no code change.
  - AC: `PATCH /v1/platform/locales/:code` toggles `uiEnabled` / `contentEnabled`; `en` cannot be disabled (409 `locale_required`); audited.
- **US-15-6** As a translator, I want to list and edit content translations by type, locale and status, so that I can translate and review.
  - AC: `GET /v1/platform/translations` filters by `contentType`, `locale`, `status`, `q`, cursor-paginated, each item with its `en` source text; `PUT /v1/platform/translations` upserts up to 500 items, `status` may be set to `missing` or `reviewed` only (`machine` is system-set), text is NUL-free and ≤ 10 000 characters; each change audited; emits `translation.updated`.
- **US-15-7** As a translator, I want to export a content type for a locale as XLIFF or XLSX, so that I can work offline or send it to an agency.
  - AC: `GET /v1/platform/translations/export?contentType&locale&format=xliff|xlsx` streams a file with source, target and status per string; XLIFF 2.1 valid; formula-like cells in XLSX are escaped.
- **US-15-8** As an owning module, I want source-text changes to flag existing translations, so that stale translations are reviewed again.
  - AC: `TranslationsService.upsertSource(items)` writes the `en` rows; a non-en row whose `source_hash` differs from the current `en` hash is reported `stale: true` and resolved like `machine` until re-reviewed; emits `translation.updated`.

## 6. Domain model

Platform-level tables (no `workspace_id`, no RLS: content is shared reference data, written only through platform routes).

```
locales       { code pk (BCP 47, e.g. 'en', 'ar', 'pt-BR'), name, native_name, dir: 'ltr'|'rtl',
                ui_enabled boolean, content_enabled boolean, created_at, updated_at }
translations  { id uuid, content_type text, content_id text, field text, locale → locales.code,
                text, status: 'missing'|'machine'|'reviewed', source_hash text (sha-256 of the en text it translates),
                updated_by → users.id?, created_at, updated_at,
                unique(content_type, content_id, field, locale), index(content_type, locale, status) }
```

- `content_type` is a stable string owned by the module that owns the content (`kc`, `core_subject`, `issue`, `questionnaire_template`, `checklist_item`, `risk_topic`, `help_article`, …); `content_id` is that module's id (uuid or stable code) — **no foreign key**, per 06 §3.2.
- The `en` row of each field is the source of truth for the English text and is written by the owning module through `upsertSource`.
- M13 §6 lists `translations` in its domain model; the table belongs to this module (06 §5) and M13 content is translated through `TranslationsService`.

## 7. Business rules & calculations

- **Locale negotiation** (pure, `engine/negotiate.ts`): candidates in order; each candidate matched exact, then by language (`pt-BR` → `pt`); `Accept-Language` parsed by quality, ties in header order, `*` ignored; invalid tags skipped; result ∈ enabled locales; default `en`.
- **Fallback**: requested locale → `en`. No chains through other languages (`pt-BR` does not fall back to `pt` for content; it does in negotiation).
- **Stale translations**: when `source_hash` of a non-en row differs from the current en hash, the row counts as `machine` (needs review) regardless of its stored status.
- **Coverage** shown to translators = reviewed rows / en rows per content type and locale (a count, not a score; computed in the repository).
- **Migration rule** (§11): legacy values identical to English are `missing`.

## 8. API contract

| Route                                                                        | Permission           | Notes                                                    |
| ---------------------------------------------------------------------------- | -------------------- | -------------------------------------------------------- |
| `GET /v1/locales`                                                            | `@Public()`          | Enabled locales; cacheable (ETag); rate-limited          |
| `GET /v1/platform/locales`                                                   | `translation:manage` | All locales with UI/content flags and content coverage   |
| `PATCH /v1/platform/locales/:code` `{ uiEnabled?, contentEnabled? }`         | `translation:manage` | 404 unknown code, 409 `locale_required` for `en`         |
| `GET /v1/platform/translations?contentType&locale&status&q&cursor&limit`     | `translation:manage` | Items with `sourceText`, `text`, `status`, `stale`       |
| `PUT /v1/platform/translations` `{ items: [...] }` (≤ 500)                   | `translation:manage` | Upsert; 422 on unknown or disabled-for-content locale    |
| `GET /v1/platform/translations/export?contentType&locale&format=xliff\|xlsx` | `translation:manage` | File stream, `Content-Disposition: attachment`           |

Content itself is served by the owning module's routes (`?locale=` or `Accept-Language`), each localised field documented with the shared `localisedTextSchema` (`{ text, locale, fallback }`) exported by this module. Errors are problem+json; new types `locale_required`, `locale_unknown`.

## 9. UI

The frontend has no feature folder for this module; it lives in the kernel (`src/lib/i18n.ts`, `src/lib/format.ts`, `src/lib/pseudo-locale.ts`, `scripts/i18n-check.mjs`):

- `SUPPORTED_LOCALES` comes from `GET /v1/locales` at boot (fallback `en` when the call fails); namespaces are lazy-loaded per feature route; `<html lang dir>` updates on change; the pseudo-locale `en-XA` stays dev/test only.
- Language pickers: sign-in page and profile (M01 settings), public survey entry (M08), all fed by `GET /v1/locales`.
- Text with `fallback: true` gets a small "English" marker (dot + label pill, `02` §9, colour never the only signal).
- The platform admin **Translations** screen (list/filter/edit/export, locale toggles) sits in the M13 admin area (`/admin/translations`, frontend `reference-data`/admin feature) and calls the routes in §8; states: loading skeleton table, empty ("no strings for this filter" + clear filters), error with retry; one entrance animation.

## 10. Events, notifications & audit

- Emits `translation.updated` `{ contentType, contentIds: string[], locale }` after a bulk upsert or `upsertSource`, so owners can bust caches/ETags.
- Emits `locale.updated` `{ code, uiEnabled, contentEnabled }` after a toggle.
- Audit (via `AuditService`): `locale.updated`, `translation.updated` (counts and ids, not texts).
- Until the M12 event bus exists, the events are recorded in audit only (06 §3.2).

## 11. Migration from legacy

- Import legacy `src/translations/*.json` values for matching English source strings (keys will differ) into the FE `src/locales/<lang>/` catalogues — mark as reviewed only for ar/de/fr/ro strings that differ from English; identical-to-English values are treated as missing.
- Legacy KC translations imported by the M13 seed are written as `machine` rows through `TranslationsService` (match by English text).
- Survey Greek strings from `translationsMap.js` → `questionnaire_template` translations (`el`) if Greek is confirmed (§13 Q2).

## 12. Test plan

- Unit: `negotiate` (table-driven + property-based: result always enabled, `en` when nothing matches), ICU catalogue formatting (plurals per locale incl. Arabic six forms), fallback key-by-key, XLIFF/XLSX writers (golden files, formula escaping).
- E2e (`test/localisation-*.e2e-spec.ts`): public locales, platform routes happy path, forbidden for workspace roles, `en` cannot be disabled, upsert validation (NUL, size, `machine` rejected), resolve with fallback flag, stale after source change.
- FE: pseudo-locale (`en-XA` with accents & 30 % expansion) and `ar` screenshot runs in Playwright for key pages; lint rule for physical CSS properties; missing-key CI check; ICU plural tests; PDF report rendering in Arabic (M11).

## 13. Open questions

1. **Which languages at launch?** _Recommended_: ship the framework with `en` enabled plus `ar` (proves RTL) in staging; seed de/fr/ro as disabled locales and enable each once a reviewer has signed off its UI catalogue and core content. Since enabling is data (`locales.ui_enabled`), this does not block the build.
2. **Is Greek needed?** _Recommended_: no at launch; import the legacy Greek survey strings as disabled `el` `machine` rows so nothing is lost, enable on customer demand.
3. **Who reviews translations?** _Recommended_: CSRC partner staff per country, given a new platform role `platform_translator` (M01 matrix) with `translation:manage` limited to assigned locales; until that role exists, platform owners only.

## 14. Module contract

Folder: `src/modules/localisation/` (backend) · frontend kernel `src/lib/i18n.ts` (no feature folder) · Wave: 1

|                             |                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Owns                        | Tables `locales`, `translations`; routes `GET /v1/locales`, `/v1/platform/locales*`, `/v1/platform/translations*`; permission `translation:manage`; problem types `locale_required`, `locale_unknown`; backend `locales/<lang>/` folder (formatter and `common` namespace; each module owns its own namespace file); frontend i18n namespace `common` stays shared kernel                                                            |
| Public surface (`index.ts`) | `LocalisationModule` (app.module) · `resolveLocale(candidates, acceptLanguage, enabled)` pure (identity, notifications, questionnaires, supplier-portal) · `LocalesService.enabled()` / `isEnabled(code)` (identity profile validation, workspaces default locale) · `TranslationsService.resolve`, `upsertSource` (reference-data, questionnaires, risk labels) · `MessageCatalogue.format` (notifications emails, dd-reporting) · `localisedTextSchema`, `LocalisedText` type (every module returning content) · event names `TRANSLATION_UPDATED`, `LOCALE_UPDATED` |
| Depends on                  | `audit` (`AuditService.record`, built; real service in e2e) · kernel (`infra/prisma`, `common/auth`, `common/validation`). No other module. Consumers fake `LocalesService`/`TranslationsService` in their own `__tests__/fakes/localisation.fake.ts`                                                                                                                                                                                                             |
| Emits                       | `translation.updated` → `{ contentType, contentIds, locale }` · `locale.updated` → `{ code, uiEnabled, contentEnabled }`                                                                                                                                                                                                                                                                                                            |
| Consumes                    | — (owning modules call `upsertSource` directly instead of this module listening to their events, so it depends on nobody)                                                                                                                                                                                                                                                                                                       |
