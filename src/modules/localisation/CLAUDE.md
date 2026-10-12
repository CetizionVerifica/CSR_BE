# Localisation (M15 · SD15)

> Spec: `docs/revamp/modules/M15-localization.md` · Status: Draft · Wave: 1

## Purpose

Makes every server-side string translatable: the registry of locales (adding a language is data, not code), the content translations of reference content owned by other modules (KCs, templates, risk-topic labels…) with English fallback, locale negotiation, and the ICU formatter used for emails and reports. Platform owners (later translators) maintain translations through the platform routes; every module that returns content resolves its localised fields here. The frontend side lives in the kernel (`Resilisense-FE` `src/lib/i18n.ts`), not in a feature folder.

## Owns

- Tables (planned, platform-level, no `workspace_id`, no RLS): `locales` (code, names, `dir`, `ui_enabled`, `content_enabled`), `translations` (unique `content_type, content_id, field, locale`; status `missing | machine | reviewed`; `source_hash`). No foreign key to other modules' content: `content_id` is the owner's id as text.
- Routes (planned): `GET /v1/locales` `@Public()` (rate-limited, ETag); `GET /v1/platform/locales`, `PATCH /v1/platform/locales/:code`, `GET|PUT /v1/platform/translations`, `GET /v1/platform/translations/export` — all `@Can('translation:manage')` (granted through `platform:*` until the translator role exists, M15 §13 Q3).
- Permission `translation:manage` (add to `common/auth` `PERMISSIONS`; no entitlement, platform-only).
- Problem types `locale_required`, `locale_unknown`.
- Backend catalogue folder `locales/<lang>/<namespace>.json` (planned): this module owns the loader/formatter and the `common` namespace; each module owns its own namespace file.
- Events `translation.updated`, `locale.updated` (constants in `events.ts`).

## Public surface (`index.ts`, planned)

| Export                                                | Why others need it                                                                                                     |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `LocalisationModule`                                  | Registered in `app.module.ts`                                                                                          |
| `resolveLocale(candidates, acceptLanguage, enabled)`  | Pure negotiation (M15 §7) for identity (`/me`), notifications (recipient), questionnaires and supplier-portal (public) |
| `LocalesService.enabled()`, `isEnabled(code)`         | Identity validates the profile locale, workspaces the default locale, consumers pass `enabled` to `resolveLocale`      |
| `TranslationsService.resolve(locale, keys)`           | Content owners (reference-data, questionnaires, risk labels) return `{ text, locale, fallback }` per field             |
| `TranslationsService.upsertSource(items, actor, tx?)` | Content owners write the `en` source text; non-en rows whose hash differs become stale                                 |
| `MessageCatalogue.format(locale, 'ns:key', values)`   | Notifications (emails) and dd-reporting (reports) render ICU messages with key-by-key `en` fallback                    |
| `localisedTextSchema`, `LocalisedText`                | Zod schema/type every module uses to document a localised field in OpenAPI the same way                                |
| `TRANSLATION_UPDATED`, `LOCALE_UPDATED`               | Event names for consumers that cache localised content                                                                 |

## Depends on

- `audit` — `AuditService.record` for locale toggles and translation edits (built; real service in e2e).
- Kernel: `infra/prisma`, `common/auth`, `common/validation`, `common/errors`, `common/pagination`, `infra/rate-limit`.
- Nothing else. Import of XLIFF/XLSX files (out of scope, M15 §4.3) will add `files` when it is built.

## Events

- Emits `translation.updated` → `{ contentType, contentIds: string[], locale }` (after `PUT /platform/translations` or `upsertSource`); `locale.updated` → `{ code, uiEnabled, contentEnabled }`. Until the M12 bus exists they are audit entries only.
- Consumes nothing: owners call `upsertSource` directly.

## Components & behaviour

- `engine/negotiate.ts` — pure: candidate list (user → workspace → recipient/campaign), `Accept-Language` by quality, exact then language-only match, only enabled locales, default `en`. Table-driven + `negotiate.property.spec.ts` (result ∈ enabled; `en` when nothing matches).
- `engine/stale.ts` — pure: `isStale(row, enHash)`; a stale or `machine` row is served with `fallback: false` but listed as needing review.
- `messages/catalogue.ts` — loads `locales/<lang>/*.json` once at boot, formats with `intl-messageformat`, falls back per key to `en`, throws in tests when an `en` key is missing.
- `locales.service.ts` / `locales.repository.ts` — registry; `en` cannot be disabled (409 `locale_required`); toggles audited.
- `translations.service.ts` / `translations.repository.ts` — `resolve` (requested locale row with status ≠ `missing`, else `en` + `fallback: true`), bulk upsert ≤ 500 items (status only `missing`/`reviewed` from the API; `machine` is system-set), list with coverage counts, export.
- `export/xliff.ts`, `export/xlsx.ts` — writers (XLIFF 2.1, XLSX with formula-like cells escaped); streamed from the controller.
- `localisation.controller.ts`, `platform-translations.controller.ts` — HTTP only; Zod DTOs in `dto/`; texts NUL-free, ≤ 10 000 chars.

## Invariants

- `en` always exists and is enabled; every resolved text has a locale that is enabled for content, or `en`.
- Never return an empty string for a field that has an `en` source; never compute or translate anything on the client's behalf (machine translation is M17, later).
- Platform tables are written only through `translation:manage` routes or the exported service; workspace roles get 403.
- No translation text in logs or audit details (ids and counts only).

## Tests

- Unit: `engine/*.spec.ts`, `engine/*.property.spec.ts`, `messages/catalogue.spec.ts` (Arabic plural forms, fallback), `export/*.spec.ts` (golden files) — US-15-2, US-15-4, US-15-7.
- E2e: `test/localisation-locales.e2e-spec.ts` (US-15-1, US-15-5), `test/localisation-translations.e2e-spec.ts` (US-15-3, US-15-6, US-15-7, US-15-8; forbidden for workspace roles).
- Add `localisation` to `spec-coverage.json` when built.

## Not here

- Frontend catalogues, `<html lang dir>`, lazy namespaces, pseudo-locale and the RTL lint rule: `Resilisense-FE` kernel (`src/lib/i18n.ts`, `scripts/i18n-check.mjs`).
- The content itself (taxonomy, templates, checklists) and the admin Translations screen: `reference-data` (M13 admin area).
- User and workspace locale fields: `identity` (M01), `workspaces` (M02). Email sending: `notifications`. Machine translation: M17.
