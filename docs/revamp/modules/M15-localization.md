# M15 — Localisation (UI, content, RTL)

> Status: Draft · Phase: 1 (framework) → 2 (content translations) · Used by: all modules
> Legacy code: FE `src/translations/{en,ar,de,fr,ro}.json` (en 761 keys; ar/de/fr ~751; de/fr/ro 105–154 still English), `src/messages/*`, `common/enum/languages.js` (**only `en` enabled**), `common/withDirection.js` (RTL broken), `components/surveys/template/translationsMap.js` (separate English/Greek survey system)

## 1. Goals
- Every user-facing string (UI, emails, reports, reference content, survey questions) is translatable; nothing hard-coded (legacy: ~317 hard-coded English strings, English-only KC texts and chart titles).
- Launch languages: **English** (source) + those confirmed by the business (candidates from legacy files: Arabic, German, French, Romanian; survey also Greek). Adding a language must require **no code change**.
- Full **RTL** support for Arabic.

## 2. Design
- **UI strings**: i18next + ICU MessageFormat; namespaces per feature (`common`, `auth`, `gap`, `materiality`, …) lazy-loaded; keys are semantic (`gap.question.relevance.label`), extracted with `i18next-parser`; CI fails on missing keys in `en` and reports coverage for other locales (warning, not failure).
- **Content strings** (taxonomy, KCs, templates, checklists, help): stored in DB `translations` (M13) and returned by the API in the requested locale with English fallback + `fallback: true` flag so the UI can mark untranslated text.
- **Emails & reports**: rendered server-side with the recipient's/report's locale; same ICU catalogues shared via a `locales` package folder in the BE.
- **Formatting**: `Intl.NumberFormat`, `Intl.DateTimeFormat`, `Intl.RelativeTimeFormat`, `Intl.PluralRules`; units via unit table (M09/M18).
- **Locale resolution**: user profile → workspace default → browser `Accept-Language` → `en`. Public survey: recipient language → browser → campaign default.
- **RTL**: `<html lang dir>` set on locale change; Tailwind logical utilities only (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`), lint rule forbids `ml-/mr-/pl-/pr-/left-/right-` in `src/`; directional icons mirrored via `rtl:` variant; charts: axis/legend mirrored where meaningful, numbers stay LTR (`dir="ltr"` spans); Arabic font loaded only for `ar`.
- **Translation workflow**: export/import XLIFF/XLSX per namespace and per content type; statuses missing/machine/reviewed; optional machine pre-translation (DeepL or Claude, M17) marked `machine` until reviewed by a human.

## 3. Migration
- Import legacy `src/translations/*.json` values for matching English source strings (keys will differ) — mark as `reviewed` only for ar/de/fr/ro strings that differ from English; identical-to-English values are treated as missing.
- Survey Greek strings from `translationsMap.js` → survey template translations (`el`) if Greek is confirmed.

## 4. Test plan
Pseudo-locale (`en-XA` with accents & 30 % expansion) and `ar` screenshot runs in Playwright for key pages; lint rule for physical CSS properties; missing-key CI check; ICU plural tests; PDF report rendering in Arabic.

## 5. Open questions
Which languages at launch? Is Greek needed? Who reviews translations (CSRC partners per country)?
