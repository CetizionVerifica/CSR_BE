# M26 — External ESG data (CSRhub ratings, optional)

> Status: Draft · Phase: B (due diligence, optional — licence permitting) · Depends on: M19 (`supplier-register`), M02 (entitlement `esg_data`), M12 (notifications, audit); M13 feature flags when built · Blocks: — (M22 `risk` consumes its event when present)
> Legacy code: none (new). Plan item SD16.

## 1. Purpose

Bring an independent, external ESG rating next to what the buyer collects itself: for suppliers that a ratings provider covers (first provider: CSRhub), fetch a monthly rating through an adapter, cache it per month, ask the buyer to confirm which provider entity is their supplier, and show the value with its **source and date** everywhere. Risk shows it as a **separate factor** (M22 §7.2) — it never silently replaces the buyer's own assessment. Small suppliers are often not covered; "no match" is a normal outcome, not an error.

## 2. Users & permissions

| Role | Can |
| --- | --- |
| workspace_owner, workspace_admin, partner_admin | See ratings, review and confirm/reject matches, search the provider manually (`esg:read`, `esg:match`) |
| viewer, auditor | See confirmed ratings with source and date (`esg:read`) |
| contributor, supplier workspaces | — |
| platform_owner | See refresh runs and provider quota, start a manual refresh; the provider is switched on per environment (licence gate below) |

`esg:read` and `esg:match` need the entitlement module `esg_data` (a licensed add-on, M02 §4.1). The provider must also be switched on globally — this is the **licence gate**: env `ESG_RATINGS_DRIVER` defaults to `off`, and until the owner confirms the CSRhub licence terms it stays `off` and every route answers `403 feature_disabled`. When M13 feature flags exist, the flag `esg_data.csrhub` (global, per-workspace override) is checked in addition, so the provider can be piloted with chosen workspaces.

## 3. Current state (legacy)

None. Legacy has no external data source.

## 4. Scope

### 4.1 Must have

- **`EsgRatingsAdapter`** (port in `src/infra/esg-ratings/`, planned) with drivers `csrhub` (production), `fake` (tests, dev) and `off`; the provider stays swappable (CLAUDE.md "keep integrations behind adapters"). Secrets from env (`ESG_RATINGS_DRIVER`, `CSRHUB_API_KEY`, `CSRHUB_BASE_URL`), validated at boot.
- **Matching** by name, country and identifiers (ticker, ISIN, LEI when known): the worker proposes candidates with a match strength (§7.1); a person **confirms** or **rejects** each; manual search for unmatched suppliers; "no match" recorded so the supplier is not re-proposed every month.
- **Monthly refresh** in a BullMQ worker (repeatable on the 2nd of each month, 03:00 UTC): fetch the rating of every confirmed provider entity once, cache it for that month, emit `external_rating.updated` per (workspace, supplier).
- **Cache per month**: one row per (provider, provider entity, month); a repeated request in the same month never calls the provider again.
- **Source + date on every value**: API responses carry `provider`, `month`, `asOf` (provider's own date) and `fetchedAt`; the UI never shows a bare number.
- **Licence gate**: entitlement `esg_data` + global switch (`ESG_RATINGS_DRIVER` ≠ `off`, later also the M13 flag `esg_data.csrhub`); display rules from the licence (attribution text, no raw export if forbidden) are config (§7.3).

### 4.2 New in the revamp

Everything above.

### 4.3 Out of scope

- Using the external rating to compute screening tiers (screening uses the buyer's assessment data; M10 §7).
- Other providers (EcoVadis, Sustainalytics, MSCI…) — the adapter allows them later; each needs its own licence and spec change.
- Bulk download or re-sale of provider data; supplier-side views of their rating.
- Automatic match confirmation (always a person, §7.1).

## 5. User stories & acceptance criteria

- **US-26-1** As a procurement lead I want the app to suggest which CSRhub company is my supplier, so that I don't have to search for each one.
  - AC: Given the provider switched on, the `esg_data` entitlement and a supplier "Acme GmbH" in DE, when the matching job runs, then the supplier shows up to 5 candidates ordered by match strength with name, country and identifiers; nothing is linked until I confirm.
- **US-26-2** As a procurement lead I confirm or reject a suggested match, or search the provider myself.
  - AC: Confirm → match `confirmed` with my user and time (audited), the current month's rating is fetched within one worker cycle and `external_rating.updated` is emitted; Reject → candidate hidden; "No match" → supplier marked `no_match` and not proposed again unless its name, country or identifiers change.
- **US-26-3** As a user I see the external rating with its source and date wherever it appears.
  - AC: The supplier's ESG panel shows "Overall 62 · CSRhub · Sep 2026" plus category values and the provider's attribution text; values older than 3 months are labelled "stale".
- **US-26-4** As a platform owner I want ratings refreshed monthly with one provider call per entity per month.
  - AC: Given 3 workspaces confirmed the same provider entity, the monthly job calls the provider once for it, caches one row for the month and emits one event per workspace; re-running the job in the same month makes no provider call.
- **US-26-5** As a workspace without the licence I see what the module does but cannot use it.
  - AC: Without `esg_data` the routes answer 403 `entitlement_required` and the UI shows the locked-module panel; with the provider switched off they answer 403 `feature_disabled` and the UI says the data source is not available yet.
- **US-26-6** A provider outage or quota limit never breaks the app.
  - AC: When the provider answers 429/5xx, the job retries with backoff (5 attempts), keeps last month's cached value marked stale, records the failure on the refresh run and no route returns 5xx.
- **US-26-7** Another workspace never sees my matches.
  - AC: Matches of workspace B are invisible (404) to A; RLS isolation test passes for `esg_matches`.

## 6. Domain model

```ts
// platform-level cache (provider data, not tenant data; no workspace_id, no RLS; only read through esg-data's repository)
esg_provider_entities { id, provider: 'csrhub', provider_entity_id text, name, country_code?, ticker?, isin?, lei?, website?,
                        unique(provider, provider_entity_id), updated_at }
esg_ratings          { id, provider, provider_entity_id, month date (first day), overall numeric(5,2), categories jsonb
                        { community?, employees?, environment?, governance? }, as_of date, fetched_at,
                        unique(provider, provider_entity_id, month) }
esg_refresh_runs     { id, provider, month, started_at, finished_at?, entities int, calls int, failures int, status }

// tenant-owned (workspace_id, RLS ENABLE + FORCE)
esg_matches          { id, workspace_id → workspaces, supplier_id uuid (supplier-register, no FK), provider,
                        status: 'pending'|'suggested'|'confirmed'|'rejected'|'no_match',
                        provider_entity_id?, strength numeric(3,2)?, candidates jsonb [{ providerEntityId, strength, reasons[] }],
                        subject_hash text,                 -- hash of name+country+identifiers the match was computed from
                        decided_by → users?, decided_at?, created_at, updated_at,
                        unique(workspace_id, supplier_id, provider) }
esg_subjects         { workspace_id, supplier_id uuid pk(workspace_id, supplier_id), name, country_code?, ticker?, isin?, lei?,
                        archived boolean, updated_at }      -- name + country copied from supplier-register (event + getSupplier backfill);
                                                            -- ticker/isin/lei entered here in the match review (M19 has no such fields)
```

## 7. Business rules & calculations

### 7.1 Matching (pure, `src/modules/esg-data/engine/match.ts`)

- `normaliseName(s)`: Unicode NFKD, strip diacritics, lowercase, `&` → `and`, drop punctuation, drop legal-form tokens (`ltd, limited, plc, inc, corp, corporation, co, llc, gmbh, ag, kg, sa, sas, sarl, srl, spa, bv, nv, ab, as, oy, pvt, private, pte, sdn, bhd, kk`), collapse spaces.
- Strength of a candidate (0–1, highest rule wins):
  - 1.00 — same ISIN or same LEI;
  - 0.95 — same ticker and same country;
  - 0.90 — equal normalised name and same country;
  - 0.75 — token Jaccard ≥ 0.8 on normalised names and same country;
  - 0.60 — equal normalised name, country differs or unknown;
  - below that: not a candidate.
- At most 5 candidates, sorted by strength desc then provider name. No candidates → status `no_match`. Candidates → `suggested`. **Never auto-confirm**, whatever the strength (owner decision in the plan: manual confirm).
- Re-match when `subject_hash` changes (supplier renamed, country or identifier changed); a `confirmed` match is kept but flagged "check" if the supplier's country changes.

### 7.2 Refresh and cache

- Month = first day of the UTC month. A rating is fetched at most once per (provider, entity, month); `esg_ratings` is the cache.
- Monthly job: distinct `provider_entity_id` over all `confirmed` matches of workspaces that are entitled (cross-tenant read through an explicit, audited repository method, never by disabling RLS) → fetch → upsert cache → for each (workspace, supplier) with that entity emit `external_rating.updated`.
- On confirm: fetch the current month for that entity if not cached, then emit for that workspace only.
- Staleness: a value whose `month` is more than 3 months before the current month is `stale: true` in responses.
- Provider errors: exponential backoff, 5 attempts; quota exhaustion pauses the run until the next day; the run row records counts.

### 7.3 Licence rules (config, not code)

`ESG_CSRHUB_ATTRIBUTION` (text shown under every value), `ESG_CSRHUB_ALLOW_EXPORT` (default `false`: values are excluded from XLSX/PDF exports and replaced by "see platform"), `ESG_CSRHUB_MAX_CALLS_PER_MONTH`. Values come from the signed licence (§13).

## 8. API contract (REST `/v1`)

All routes need entitlement `esg_data` and the provider switched on (else 403 `entitlement_required` / `feature_disabled`; `feature_disabled` is a new `PROBLEM_TYPES` entry).

| Route | Permission | Returns |
| --- | --- | --- |
| `GET /suppliers/:sid/esg-rating` | `esg:read` | `{ match: { status, providerEntity? }, rating?: { provider, overall, categories, month, asOf, fetchedAt, stale, attribution } , history[] (≤ 12 months) }` |
| `GET /companies/:cid/esg-matches?status=&cursor=` | `esg:read` | match queue with candidates |
| `POST /esg-matches/:id/confirm` `{ providerEntityId }` | `esg:match` | confirmed match; 409 `conflict` if already decided by someone else |
| `POST /esg-matches/:id/reject` `{ providerEntityId? }` · `POST /esg-matches/:id/no-match` | `esg:match` | updated match |
| `GET /esg-provider/search?q=&country=` | `esg:match` | provider entities (from cache first, then provider; rate-limited 30/min per workspace) |
| `GET /platform/esg/refresh-runs` · `POST /platform/esg/refresh-runs` (manual run, `Idempotency-Key`) | `platform:*` | runs |

## 9. UI

Namespace `esg-data`. Calm Ledger (02 §9).

- **`/suppliers/:supplierId/esg` — ESG rating tab** (route child composed into the M19 supplier detail by the router, shown with `esg:read` + module) holding the **ESG rating panel** (`ExternalRatingPanel`): overall value + 4 category values as small bars (`--motion-grow` once), "source · month" line and attribution, "stale" pill when old, link "Review match" when not confirmed. States: not entitled → small locked note (not the full panel); provider off → "External ratings are not available yet"; `no_match` → "Not covered by CSRhub — common for smaller companies"; loading skeleton; error with retry.
- **`/suppliers/esg-matches` — Match review** (`esg:match`): DataTable of suppliers with status tabs Suggested · Unmatched · Confirmed · Rejected (URL-synced), each row expandable to its candidates (name, country, identifiers, strength as words "Strong / Likely / Possible" + number, reasons). Actions: Confirm (one candidate), Reject, No match, Search provider (sheet with search form; the identifiers typed there — ticker, ISIN, LEI — are saved on `esg_subjects` and re-run the match). Empty: "No suggestions to review" + explanation of monthly matching. Error: retry.
- Nav: no own item; reached from the supplier register's toolbar ("ESG matches", shown with `esg:read` + module) and from the panel.
- Keyboard: rows are reachable with Tab; expanding uses a button with `aria-expanded`; Confirm/Reject buttons name the candidate (`aria-label="Confirm Acme GmbH"`).

## 10. Events, notifications & audit

- Emits `external_rating.updated` `{ workspaceId, supplierId, provider, providerEntityId, month, overall, categories, asOf }` (consumers: `risk`, `monitoring`; dd-reporting reads `EsgQueries.ratingFor` on demand).
- Consumes `supplier.created|updated` → upsert `esg_subjects`, (re)compute candidates when `subject_hash` changes; `supplier.archived` → stop refreshing for that workspace.
- Audit: `esg_match.confirmed|rejected|no_match` (actor, supplier, entity), `esg_refresh.run` (platform). In-app notification to procurement leads when new suggestions are waiting after the monthly run (one digest, category `due_diligence`).

## 11. Migration from legacy

Nothing to migrate.

## 12. Test plan

- Engine: table tests for `normaliseName` (legal forms, diacritics, `&`) and strength rules incl. ties and the 5-candidate cap; property tests (strength in [0,1], symmetric name equality, idempotent normalisation).
- Adapter: contract tests run against the `fake` driver and a recorded-response stub of `csrhub` (no live calls in CI).
- E2e (`test/esg-data-*.e2e-spec.ts`): provider off → 403 `feature_disabled`; no entitlement → 403; confirm → fetch → event; one provider call per entity per month across workspaces; provider 429 → retries, no 5xx; RLS isolation.
- Frontend: MSW tests for the panel states and the match review flow; axe.

## 13. Open questions

- **CSRhub licence terms** (display, caching across customers, export, attribution, price, quota)? Recommended: keep `ESG_RATINGS_DRIVER=off` until signed; design assumes caching per provider entity is allowed across workspaces and export is not — adjust §7.3 config, not code, if terms differ.
- **Is the cache shared across workspaces** (one provider call per entity) or per workspace? Recommended: shared platform cache if the licence allows (cheaper, fewer calls); otherwise add `workspace_id` to `esg_ratings` in the same PR.
- **Which CSRhub endpoints and identifiers are available on our plan** (ISIN/LEI search, monthly history)? Recommended: confirm with the provider before the build; the adapter interface (`searchEntities`, `getRating(entity, month)`) does not change.
- **Should the external rating influence residual risk by default?** Recommended: no — weight 0 by default (M22 §7.2), the buyer opts in up to 0.15.

## 14. Module contract

Folder: `src/modules/esg-data/` · `src/features/esg-data/` · Wave: 4 (optional, licence permitting)

| | |
| --- | --- |
| Owns | Tables `esg_provider_entities`, `esg_ratings`, `esg_refresh_runs` (platform cache), `esg_matches`, `esg_subjects` (tenant, RLS); adapter port `EsgRatingsAdapter` (`src/infra/esg-ratings/`, drivers `csrhub`, `fake`, `off`); routes `/v1/suppliers/:sid/esg-rating`, `/v1/companies/:cid/esg-matches`, `/v1/esg-matches/:id/*`, `/v1/esg-provider/search`, `/v1/platform/esg/refresh-runs`; permissions `esg:read`, `esg:match` (module `esg_data`); env `ESG_RATINGS_DRIVER` + later flag `esg_data.csrhub`; problem type `feature_disabled`; queue `esg-data`; i18n namespace `esg-data`; FE routes `/suppliers/esg-matches`, `/suppliers/:supplierId/esg` |
| Public surface (`index.ts`) | `EsgDataModule`; `EsgQueries.ratingFor(workspaceId, supplierId)` → `ExternalRatingView` (dd-reporting sections, with source and date); `EsgEvents` (`external_rating.updated`) · FE: `esgDataRoutes`, `supplierEsgRoute` (tab child for M19 `supplierDetailRoute(extraTabs)`, composed in the router), `ExternalRatingPanel` |
| Depends on | `supplier-register`: `getSupplier`, `listSuppliers` read model + `supplier.*` events (fake `supplier-register.fake.ts`); `workspaces`: entitlement `esg_data` and the list of entitled workspaces for the monthly job; M13 feature flags `isEnabled('esg_data.csrhub', workspaceId)` once built (until then the env switch only); `notifications`: event bus, `notify()` (fake); `audit`: `AuditService` |
| Emits | `external_rating.updated` → `{ workspaceId, supplierId, provider, providerEntityId, month, overall, categories, asOf }` |
| Consumes | `supplier.created`/`supplier.updated` → upsert `esg_subjects`, re-match when name/country/identifiers change · `supplier.archived` → stop refreshing |
