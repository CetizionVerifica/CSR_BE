# M21 — Questionnaires (supplier self-assessment, SAQ)

> Status: Draft · Phase: A (wave 2) · Depends on: M01, M02, M12 (notifications, audit), M13 (reference-data templates), M14 (files), M19 (supplier-register) · Consumes events of: M20 (supplier-portal), M24 (monitoring `reassessment.due`) · Blocks: M22 (risk residual), M24 (monitoring), M11/M16 (dd-reporting)
> Parent specs: M08 (form builder, tokens, public respondent app) and M10 §4.2 "Supplier questionnaires (SAQ)" — this spec supersedes M10 §4.2 SAQ bullet, the SAQ row of M10 §8 and the SAQ open question of M10 §13.
> Legacy code: none for SAQ (new). Reference only: BE `server/controllers/surveys.js` (token flow, reminders — bugs listed in M08 §3), FE `surveys/template/*` (renderer, ranking UX).

## 1. Purpose

Let a **buyer** collect structured, comparable self-assessments from many suppliers — code of conduct acknowledgement, human rights, environment, anti-corruption, conflict minerals — and turn the answers into **per-question scores** that feed risk (M22), screening and reports. Suppliers answer either on the platform (linked suppliers, inside their own workspace) or through a **token link** without an account (invited or off-platform suppliers). A linked supplier **answers once and shares with many buyers**: a submitted response can be reused for every buyer that asks for the same template version.

## 2. Users & permissions

| Role                                                                    | Can                                                                                                     | Permission             |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------- |
| Buyer workspace_owner / workspace_admin / partner_admin (procurement lead, compliance officer) | Create campaigns from templates, pick suppliers, send, remind, close, review responses, export | `questionnaire:manage` |
| Buyer viewer / auditor                                                  | Read campaigns, responses, scores                                                                        | `questionnaire:read`   |
| Supplier workspace_owner / workspace_admin / contributor (linked supplier) | See questionnaire requests from customers, answer, attach evidence, submit, reuse and share a submitted response | `questionnaire:answer` |
| Token respondent (off-platform or not yet linked supplier)              | Open, answer, save & resume, upload evidence, submit **their own** questionnaire only                   | public token           |
| platform_owner / content_editor                                         | Curate the global template library (reference-data, M13)                                                | `platform:*`           |

All three permissions need entitlement `due_diligence` (expected in M02; until it exists, `supply_chain`). Supplier-side `questionnaire:answer` needs no paid module: a supplier on a free workspace can answer its customers' requests (decision proposed in §13).

## 3. Current state (legacy)

No supplier questionnaire exists. The only questionnaire engine is the materiality survey (M08 §3): forgeable `jwt(sideID)` tokens, reads via PATCH, un-debounced autosave, reminders that pick the wrong company, hard-coded English/Greek. Off-platform suppliers are free-text rows that default to `Noncompliant` (M10 §3). None of this is carried over.

## 4. Scope

### 4.1 Must have (Phase A)

- **Template library** (read from `reference-data`): versioned global templates per topic — `code_of_conduct`, `human_rights`, `environment`, `anti_corruption`, `conflict_minerals` — each a form definition (§6.1) with sections, questions, scoring rules and translations. Campaigns pin `key@version`.
- **Campaigns**: one template version, many suppliers, languages, deadline, email texts, reminder schedule; wizard Template → Suppliers → Message → Schedule & review (M08 §9 pattern).
- **Recipients**: suppliers picked from the register (filters by tier, country, category, risk band, tag); the recipient email and language come from the supplier's primary contact, editable per recipient. One assignment per (campaign, supplier).
- **Delivery**: linked suppliers get an in-app request + email; others get a **token link** (M08 §7.3 token rules). Up to 3 automatic reminders (default day 7, 14, deadline − 2) only to not-submitted assignments; manual remind; extend deadline per assignment.
- **Answering** (public minimal shell for tokens; assessment workspace pattern for linked suppliers): section navigator with progress, autosave (800 ms debounce), save & resume, conditional questions, evidence upload per question (M14, scanned), N/A where allowed, review page with missing required answers, submit with declaration checkbox (name + role of the signatory).
- **Scoring**: pure engine (§7.2) computes per-question, per-section and overall scores (0–100) and critical flags at submit and after review; the client never sends a score.
- **Review**: buyer reviews each answer (accept / request clarification with comment), may override a question's points with a reason (audited), then **accepts** or **returns** the response; returned responses reopen for the supplier.
- **Answer once, share with many** (linked suppliers): a supplier's submitted response to template `key@version` stays in its own **response library**; when another buyer requests the same template version within its validity (default 12 months), the supplier chooses **Reuse** (one click, consent dialog naming the buyer) instead of re-answering.
- **Read models**: campaign progress (sent / opened / in progress / submitted / accepted / overdue), per-supplier latest accepted score per template, response detail with answers, scores and evidence.
- Exports: campaign responses XLSX (one row per supplier, one column per question + scores); numbers identical to the API.

### 4.2 New in the revamp (Phase C)

- Workspace **custom templates**: clone a global template into a workspace draft, edit questions and scoring with the form builder (question types of M08 §4.2), publish a workspace version. Platform editing of global templates stays in M13.
- Recurring campaigns (yearly reassessment): `monitoring` (M24) emits `reassessment.due { kind: 'questionnaire', supplierId, templateRef }`; this module adds the supplier to a draft campaign with `source = 'monitoring'` for that template (one draft per company, template and month), which a buyer reviews and sends. No HTTP call from monitoring, so neither module depends on the other.
- Machine translation of free-text answers for reviewers (M17), marked as machine-translated.

### 4.3 Out of scope

Materiality and stakeholder surveys (M08 keeps them); risk scoring from questionnaire results (M22 consumes our events); corrective actions from failed answers (M09 / corrective-actions); certificate expiry (supplier-evidence); sharing consent per customer and year (supplier-portal, M20).

## 5. User stories & acceptance criteria

- **US-21-1** As a procurement lead I create a campaign from the global "Human rights v2" template and send it to 120 suppliers.
  - AC: Given 120 selected suppliers (80 off-platform, 40 linked) when I send, then 80 token emails and 40 in-app requests + emails are queued within one request (`202`, Idempotency-Key), the campaign is `open`, and the dashboard shows 120 `sent`.
- **US-21-2** As an off-platform supplier I open the link on a phone, answer half, leave, and resume later from the same link at the same section.
  - AC: Given a valid token when I reopen it then saved answers and the last section are restored; works at 360 px and in RTL.
- **US-21-3** A tampered, expired or closed-campaign link shows a friendly "link invalid or expired" page that reveals nothing about the buyer or campaign.
  - AC: `GET /public/questionnaires/:token` answers `404 invalid_token` for unknown, expired and revoked tokens alike; 10 failures per minute per IP hash answer `429 rate_limited`.
- **US-21-4** Reminders go only to suppliers that have not submitted, and at most 3 automatic reminders are sent.
  - AC: Given 3 submitted and 2 open assignments when the reminder job runs then exactly 2 emails are sent and `reminders_sent` increments only for them.
- **US-21-5** When a supplier submits, the server computes the scores; the buyer sees overall, section and per-question points and critical flags.
  - AC: Given the fixtures in `engine/__fixtures__/` when submitted then the stored scores equal the expected values; a body that contains a score is rejected (`400 validation_failed`).
- **US-21-6** As a reviewer I override one question's points with a reason and accept the response; the score is recomputed by the engine and the override is in the audit trail.
- **US-21-7** As a linked supplier I reuse my accepted "Code of conduct v1" response for a second customer without re-answering.
  - AC: Given a submitted response to `code_of_conduct@1` less than 12 months old when customer B requests the same version then "Reuse" is offered; after consent customer B sees the answers and scores, and `questionnaire.shared` is audited for both workspaces.
- **US-21-8** If a supplier revokes a customer's access (M20), that customer no longer sees the answers of reused responses; its own campaign record and the score history it already received stay.
- **US-21-9** As a procurement lead I export a campaign to XLSX with the same scores as the screen.

## 6. Domain model

### 6.1 Form definition (shared, kernel)

A template version's `definition` is validated by one Zod schema, `FormDefinition` in `src/common/forms/definition.ts` (planned, kernel: used by reference-data at publish, by questionnaires, later by M08 and M18):

```ts
FormDefinition { key, version, languages, sections: Section[], scoring: { method: 'weighted_points', sectionWeights?: Record<sectionKey, number> } }
Section  { key, title: I18n, questions: Question[], showIf?: Condition }
Question { key, type: 'yes_no'|'single'|'multi'|'likert'|'number'|'text'|'date'|'file'|'matrix', title: I18n, help?: I18n,
           required, allowNA, options?: { key, label: I18n, points?: number }[], evidence?: 'none'|'optional'|'required',
           scoring?: { maxPoints, evidencePoints?, bands?: { min?, max?, points }[] (number), critical?: { failWhen: Condition, flag: string } },
           showIf?: Condition }
Condition { questionKey, op: 'eq'|'neq'|'in'|'gte'|'lte'|'answered', value? }
```

### 6.2 Tables (owned by questionnaires; all tenant tables have `workspace_id`, RLS, `created_at/updated_at`)

```ts
questionnaire_campaigns   { id, workspace_id, buyer_company_id → companies, template_key, template_version, definition jsonb (snapshot),
                            title, languages text[], opens_at, due_at, closes_at?, status: 'draft'|'scheduled'|'open'|'closed'|'archived',
                            message jsonb (subject/body overrides per language), reminder_days int[], source: 'manual'|'monitoring', created_by → users }
questionnaire_assignments { id, workspace_id (buyer), campaign_id, supplier_id (uuid, no FK), supplier_name_snapshot, recipient_email?, language,
                            channel: 'token'|'in_app', token_hash? unique, token_expires_at?, supplier_workspace_id? (uuid, no FK),
                            status: 'pending'|'sent'|'opened'|'in_progress'|'submitted'|'returned'|'accepted'|'declined'|'expired',
                            due_at, reminders_sent smallint, last_reminder_at?, response_id?, access_revoked_at? }
questionnaire_responses   { id, workspace_id (owner: buyer for token answers, supplier for in-app answers), template_key, template_version,
                            definition_hash, status: 'in_progress'|'submitted'|'returned'|'accepted', language, last_section_key?,
                            submitted_at?, signatory jsonb?, accepted_at?, accepted_by?, valid_until?, score_overall numeric(5,1)?,
                            score_sections jsonb?, critical_flags text[], scored_at?, engine_version,
                            source_share_id? (buyer copy of a supplier response), answers_hidden_at? (share revoked) }
questionnaire_answers     { id, workspace_id, response_id, question_key, value jsonb, na boolean, file_ids uuid[] (→ files),
                            points numeric(6,2)?, max_points numeric(6,2)?, review_status: 'pending'|'accepted'|'clarify',
                            override_points numeric(6,2)?, override_reason?, unique(response_id, question_key) }
questionnaire_requests    { id, workspace_id (supplier), buyer_workspace_id, buyer_name_snapshot, assignment_id, template_key,
                            template_version, due_at, status mirror, response_id? }      -- inbox row in the supplier workspace
questionnaire_shares      { id, workspace_id (supplier), response_id, buyer_workspace_id, assignment_id, shared_at, shared_by, revoked_at? }
questionnaire_supplier_links { id, workspace_id (buyer), supplier_id, supplier_workspace_id, linked_at, revoked_at? }   -- projection of supplier.linked
questionnaire_comments    { id, workspace_id, response_id, question_key, author_type: 'buyer'|'supplier', author_id?, body, created_at }
```

Indexes: `assignments(campaign_id, status)`, `assignments(supplier_id)`, `responses(workspace_id, template_key, template_version, status)`, `requests(workspace_id, status)`.

Cross-workspace rows: `questionnaire_requests` and `questionnaire_shares` live in the supplier workspace; the buyer reads a shared response only through `SharedResponsesRepository.readForBuyer(buyerWorkspaceId, assignmentId)`, an explicit audited cross-tenant method that checks a non-revoked share row (01 tenancy rule; never by disabling RLS).

## 7. Business rules & calculations

### 7.1 Lifecycles

- **Campaign**: `draft → scheduled → open → closed → archived`; `draft → open` on send now. Sending needs ≥ 1 recipient with an email or a linked workspace. The definition is snapshotted at send; editing questions after send is impossible (new campaign / template version). Closing sets `expired` on assignments not submitted; reopen is allowed until `archived` and returns expired assignments to `sent` with a new due date (new tokens issued).
- **Assignment**: `pending → sent → opened → in_progress → submitted → accepted`; `submitted → returned → in_progress`; `sent|opened|in_progress → declined` (supplier declines with reason) or `→ expired` (campaign closed / token expired). Transitions only in `assignments.service.ts`; an invalid one answers `409 invalid_state_transition`.
- **Response**: `in_progress → submitted → accepted`, `submitted → returned → in_progress`. Answers are writable only `in_progress`. `accepted` responses are immutable; `valid_until = accepted_at + 12 months` (configurable per template).

### 7.2 Scoring engine (`src/modules/questionnaires/engine/score.ts`, pure)

For each **visible** question q (its `showIf` and its section's `showIf` evaluate true on the answers) that has `scoring`:

- `earned(q)`:
  - `yes_no` / `single`: points of the chosen option (0 if none);
  - `multi`: sum of chosen option points, capped at `maxPoints`;
  - `likert`: points of the chosen step (options carry points);
  - `number`: points of the first band with `min ≤ value < max` (inclusive `min`, exclusive `max`, last band inclusive), 0 when no band matches;
  - plus `evidencePoints` when `evidence ≠ 'none'` and ≥ 1 attached file has scan status `ready`;
  - then `override_points` replaces the computed value when the reviewer set one (0 ≤ override ≤ max).
- `max(q) = maxPoints + (evidencePoints ?? 0)`.
- N/A (`allowNA` and answered N/A) and hidden questions are **excluded** (neither earned nor max). Unanswered visible scorable questions in a submitted response count `earned = 0` with their max.
- Section score `S_s = 100 × Σ earned / Σ max` over its questions; `null` when `Σ max = 0`.
- Overall `O = Σ_s (w_s × S_s) / Σ_s w_s` over sections with non-null `S_s`, `w_s` from `sectionWeights` (default 1); `null` when no section is scorable.
- Rounding: computed with decimal arithmetic, rounded half-up to 1 decimal only at the end; stored `numeric(5,1)`.
- Critical flags: every visible question whose `critical.failWhen` holds adds `critical.flag` (e.g. `child_labour_policy_missing`); flags do **not** change the score — risk (M22) decides their effect.
- Output also carries `answeredRatio = answered required visible / required visible` (progress), and `engine_version`.
- Recomputed on submit, on each review override, and never on read. Golden fixtures per global template in `engine/__fixtures__/`.

### 7.3 Tokens

M08 §7.3 rules: 32 random bytes base64url, SHA-256 stored, link `https://survey.resilisense.org/q/<token>`, expires `due_at + 30 days` or campaign close + 7 days (whichever first), revoked when the assignment is cancelled, the supplier gets linked (in-app takes over, existing answers kept) or the response is accepted (then read-only view until expiry). Public routes rate-limited per token and per IP hash.

### 7.4 Answer once, share with many

- Only linked suppliers (in-app channel) have a response library; token responses belong to the buyer workspace.
- A request for `key@version` offers **Reuse** when the supplier workspace has a response with the same `template_key`, `template_version`, `definition_hash`, status `submitted|accepted` and `valid_until > now` (submitted responses use `submitted_at + 12 months`).
- Reuse (and an in-app submit) creates a `questionnaire_shares` row in the supplier workspace and, through the audited cross-tenant method, a **buyer copy**: a `questionnaire_responses` row in the buyer workspace with `source_share_id` and copies of the answer rows. The buyer's review status, overrides and recomputed scores live only on that copy; the assignment becomes `submitted` and points to it (`response_id`). The supplier's own response is never modified by a buyer, and one supplier response can back copies for many buyers.
- On `supplier_access.revoked` (M20) for (buyer, supplier, year) the share is revoked (`revoked_at`) and the buyer copy's answers and files are hidden (`answers_hidden_at`) (scores and status stay in the buyer's history, US-21-8), mirroring M10 §7 "revocation hides historical detail".
- A different template version is never reused automatically.

## 8. API contract (REST `/v1`)

Authenticated, buyer side:

| Route                                                                                         | Permission                                  |
| --------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `GET /questionnaire-templates?topic=&language=` (global from reference-data + workspace)        | `questionnaire:read`                        |
| `GET/POST /questionnaire-campaigns` · `GET/PATCH /questionnaire-campaigns/:id`                  | `questionnaire:read` / `questionnaire:manage` |
| `PUT /questionnaire-campaigns/:id/recipients` `{ supplierIds[], overrides? }` · `GET …/recipients?status=&cursor=` | `questionnaire:manage` / `questionnaire:read` |
| `POST /questionnaire-campaigns/:id/send` · `…/remind` `{ assignmentIds? }` · `…/close` · `…/reopen` (Idempotency-Key) | `questionnaire:manage` |
| `POST /questionnaire-campaigns/:id/test-email` `{ to, language }`                              | `questionnaire:manage`                      |
| `GET /questionnaire-campaigns/:id/stats` · `GET …/export.xlsx`                                  | `questionnaire:read` / `dd_report:export`   |
| `PATCH /questionnaire-assignments/:id` `{ dueAt }` · `POST …/cancel`                            | `questionnaire:manage`                      |
| `GET /questionnaire-responses/:id` (answers, scores, files, comments)                           | `questionnaire:read`                        |
| `PATCH /questionnaire-responses/:id/answers/:questionKey/review` `{ status, overridePoints?, reason?, comment? }` | `questionnaire:manage`  |
| `POST /questionnaire-responses/:id/accept` · `POST …/return` `{ comment }`                      | `questionnaire:manage`                      |
| `GET /suppliers/:sid/questionnaire-summary` (latest accepted score per template, open assignments) | `questionnaire:read`                     |
| `GET /companies/:cid/questionnaire-progress?supplierIds=` (≤ 200 ids) → `{ supplierId, completionPct, status, lastScore? }[]` for the register column (M19 §9); suppliers without assignments are omitted | `questionnaire:read` |

Authenticated, supplier side (linked supplier workspace):

| Route                                                                                         | Permission             |
| --------------------------------------------------------------------------------------------- | ---------------------- |
| `GET /questionnaire-requests?status=` · `GET /questionnaire-requests/:id`                       | `questionnaire:answer` |
| `POST /questionnaire-requests/:id/start` · `POST …/reuse` `{ responseId }` · `POST …/decline` `{ reason }` | `questionnaire:answer` |
| `GET /my-questionnaire-responses` (library) · `GET /my-questionnaire-responses/:id`             | `questionnaire:answer` |
| `PUT /my-questionnaire-responses/:id/answers/:questionKey` · `POST …/submit` `{ signatory }`    | `questionnaire:answer` |

Public (token in path, `@Public()`, rate-limited, no auth header):

| Route                                                  | Notes                                                                       |
| ------------------------------------------------------ | --------------------------------------------------------------------------- |
| `GET /public/questionnaires/:token`                    | definition in the requested language, saved answers, branding, due date     |
| `PUT /public/questionnaires/:token/answers/:questionKey` | autosave; `409` when not `in_progress`                                     |
| `POST /public/questionnaires/:token/uploads`            | upload intent through `files` (purpose `questionnaire_evidence`, 20 MB), bound to the token |
| `POST /public/questionnaires/:token/submit`             | `{ signatory }`; `422` with missing required keys                          |
| `POST /public/questionnaires/:token/decline`            | `{ reason }`                                                               |

Errors: problem+json types `invalid_token`, `invalid_state_transition`, `validation_failed`, `rate_limited`, `entitlement_required`, `not_found`.

## 9. UI

Buyer (app shell, Due diligence group, nav item "Questionnaires" after Suppliers, `questionnaire:read` + module `due_diligence`; locked-module panel otherwise):

- `/questionnaires` — campaigns list page (02 §5): columns title, template, sent, completion % (Risk-meter-style inline bar in neutral `--primary`, number always visible), due date, status pill; filters status/template/year; empty state "Send your first supplier questionnaire" + CTA; skeleton rows; error with retry.
- `/questionnaires/new` — wizard (02 §5, ≤ 5 steps): Template (cards per topic with version, languages, question count, preview drawer) → Suppliers (register picker with filter chips; shows why a supplier cannot receive it, e.g. no contact email) → Message (per language, preview, test email) → Schedule & reminders → Review & send.
- `/questionnaires/:id` — campaign dashboard (02 §9.5 dashboard pattern): 4 `StatTile`s (sent, in progress, submitted, accepted, with `--motion-count`), completion funnel bar (`BarChart` via `ResiliChart`, fixed status order, "View as table"), score distribution (`BarChart`, score buckets 0–19…80–100 from the API), recipients `DataTable` (supplier, channel, status chip, score, critical flags count, last reminder, actions remind/extend/cancel); tabs Overview · Recipients · Settings URL-synced.
- `/questionnaires/responses/:rid` — review in the **assessment workspace** pattern (02 §5): navigator with section scores, question card showing the answer, evidence list (M14 preview), points `earned / max`, critical flag badge (icon + label), review controls (Accept / Clarify, override with reason); context panel Comments · History; sticky bar "Accept response" / "Return to supplier".
- Supplier detail tab "Questionnaires" at `/suppliers/:sid/questionnaires`: this feature exports `supplierQuestionnairesTabRoute`, which `src/app/router.tsx` passes to M19 `supplierDetailRoute(extraTabs)` (data `GET /suppliers/:sid/questionnaire-summary`); the register never imports this feature.

Supplier, linked (app shell, nav "Questionnaire requests" in Due diligence, `questionnaire:answer`):

- `/questionnaire-requests` — inbox list (customer, template, due date, status); empty state explains customers send requests here.
- `/questionnaire-requests/:id` — start / reuse (consent dialog naming the customer and what will be visible) / decline.
- `/my-questionnaires/:responseId` — answering in the assessment workspace pattern with autosave indicator, `J/K` navigation, review page and submit with declaration.

Token respondent (public minimal shell, `https://survey.resilisense.org/q/:token`, M08 public entry, < 100 kB JS): buyer logo + "requested by <Buyer>", language switch, progress bar, one section per screen, `body-lg`, autosave, evidence dropzone, review page, submit, thank-you page; invalid-link page (US-21-3). Works at 360 px, RTL, keyboard only.

States everywhere: skeleton while loading, empty state with CTA, error with retry. Calm Ledger: one entrance per view (`--motion-enter` for tiles and first 12 rows, `--motion-grow` for bars, `--motion-count` for tile numbers), none on refetch; reduced motion renders final values.

## 10. Events, notifications & audit

Emits (constants in `events.ts`):

- `questionnaire.sent` `{ workspaceId, campaignId, templateKey, templateVersion, assignmentCount }`
- `questionnaire.submitted` `{ workspaceId, assignmentId, responseId, supplierId, templateKey, templateVersion, scoreOverall, scoreSections, criticalFlags, submittedAt, shared: boolean }`
- `questionnaire.reviewed` `{ workspaceId, assignmentId, responseId, supplierId, templateKey, templateVersion, decision: 'accepted'|'returned', scoreOverall, criticalFlags, decidedAt }` — risk (M22) uses accepted scores (latest per `templateKey`)
- `questionnaire.overdue` `{ workspaceId, assignmentId, supplierId, dueAt }` — monitoring (M24)
- `questionnaire.submitted` is also consumed by monitoring (M24: overdue alert resolved, reassessment done)
- `questionnaire.shared` `{ supplierWorkspaceId, buyerWorkspaceId, responseId, assignmentId }`

Consumes (`OnDomainEvent`): `supplier.linked` `{ workspaceId (buyer), supplierId, supplierWorkspaceId }` (M20; projection `questionnaire_supplier_links`, switch open token assignments to in-app), `supplier_access.revoked` `{ workspaceId, supplierId, year }` (M20; revoke shares, hide answers), `supplier.archived` (M19; cancel open assignments), `file.scanned` (M14; evidence points recomputed when a file becomes `ready` or `quarantined`), `reassessment.due` with `kind = 'questionnaire'` (M24; supplier added to a `source = 'monitoring'` draft campaign, §4.2).

Notifications (`notifications`: `sendEmail()` to token respondents, `notify()` to members): invite, reminder, deadline extended, returned for clarification (to supplier); submitted (daily digest), declined (to campaign owner). Audit: campaign send/close, recipient changes, every answer change (diff without free-text bodies over 1 kB), review decisions and overrides with reason, share and revoke, exports.

## 11. Migration from legacy

None (new capability). Global templates are seeded by reference-data (M13) from content supplied by the CSRC content team; seed asserts each template validates against `FormDefinition` and each scorable question has `maxPoints > 0`.

## 12. Test plan

- Engine: table-driven `score.spec.ts` (each question type, bands boundaries, N/A, hidden by `showIf`, empty denominators, overrides, evidence only when `ready`, weights) + `score.property.spec.ts` (0 ≤ score ≤ 100, adding N/A never changes score, monotonic in option points) + golden fixtures per template.
- E2e: `test/questionnaires-campaigns.e2e-spec.ts` (US-21-1, -4, -9, forbidden role, other workspace 404, invalid transition 409), `test/questionnaires-public.e2e-spec.ts` (US-21-2, -3, -5: token enumeration, expiry, rate limit, score in body rejected), `test/questionnaires-review.e2e-spec.ts` (US-21-6), `test/questionnaires-sharing.e2e-spec.ts` (US-21-7, -8: cross-workspace reads only through the audited method, RLS isolation).
- FE: renderer a11y (each question type keyboard + screen reader), public app at 360 px / RTL / axe, wizard, review page; Playwright journeys "send questionnaire" and "answer questionnaire by link".

## 13. Open questions

1. **SAQ-BE / SAQ-FE reuse vs rebuild.** The organisation has separate `SAQ-BE`/`SAQ-FE` repositories. **Recommendation: rebuild here, salvage content.** Reusing the product would add a second stack, auth, tenancy and deployment, outside RLS, the audit trail and the M01 permission model; it cannot share the response library across buyers or feed the risk engine through events. Import its question banks and scoring weights as global templates (M13 seed) and review its UX for the answering flow. Revisit only if SAQ already holds live customer data that must keep working (then migrate it as accepted responses).
2. **M08 relationship.** M08 (materiality surveys) is not on the DD roadmap. **Recommendation:** questionnaires builds the shared parts first — `FormDefinition` schema in `src/common/forms/` (backend kernel), the question renderer exported from `@/features/questionnaires` (frontend) and the public entry `src/public/` (frontend) — and M08 reuses them when it is built. Owned here: campaigns, assignments, responses, scoring, sharing. Reused from M08's design (not code): token rules (§7.3), reminder schedule, public respondent UX, autosave.
3. **Free supplier workspaces.** Should answering need no paid module? **Recommendation:** yes, `questionnaire:answer` needs no entitlement, so suppliers join for free (network effect, SD03).
4. **Reuse validity.** **Recommendation:** 12 months by default, configurable per template; buyers can require a fresh answer per campaign (`allowReuse: false`).
5. **Who owns the template definition at answer time if reference-data publishes a new version?** **Recommendation:** campaigns snapshot the definition at send (§6.2), so new versions never change an open campaign.

## 14. Module contract

Filled by `/module-contract` (`06-modular-build.md` §2.1, §3). Folder: `src/modules/questionnaires/` · `src/features/questionnaires/` · Wave: 2

| | |
| --- | --- |
| Owns | Tables `questionnaire_campaigns`, `questionnaire_assignments`, `questionnaire_responses`, `questionnaire_answers`, `questionnaire_requests`, `questionnaire_shares`, `questionnaire_supplier_links`, `questionnaire_comments` (all RLS). Routes `/v1/questionnaire-templates`, `/v1/questionnaire-campaigns*`, `/v1/companies/:cid/questionnaire-progress`, `/v1/questionnaire-assignments*`, `/v1/questionnaire-responses*`, `/v1/suppliers/:sid/questionnaire-summary`, `/v1/questionnaire-requests*`, `/v1/my-questionnaire-responses*`, `/v1/public/questionnaires/:token*`. Permissions `questionnaire:read`, `questionnaire:manage`, `questionnaire:answer` (entitlement `due_diligence` for read/manage). i18n namespace `questionnaires` (+ `public-questionnaire` in the public entry). Pure engine `engine/score.ts`. |
| Public surface (`index.ts`) | `QuestionnairesModule` (app.module); `QuestionnaireEvents` (event name constants: risk, monitoring, dd-reporting consume); `QuestionnaireSummaryQuery.latestAcceptedBySupplier(workspaceId, supplierId)` → `SupplierQuestionnaireSummary` (dd-reporting supplier profile) and the batch `latestAcceptedForSuppliers(workspaceId, supplierIds, { year? })` → `SupplierQuestionnaireSummary[]` (screening, dd-reporting; risk only for backfill, it takes facts from `questionnaire.reviewed`); `QuestionnaireSummaryQuery.progressFor(workspaceId, companyId, supplierIds)` (the HTTP progress route, dd-reporting completion tile); `CampaignReadModel`/`ResponseReadModel` types (dd-reporting); `scoreResponse` + `ScoreResult` (pure engine, for golden tests in dd-reporting parity checks). Frontend `index.ts`: `questionnairesRoutes`, `supplierQuestionnaireRoutes`, `publicQuestionnaireRoutes`, `QuestionnaireRenderer` (M08/M18 reuse later), `supplierQuestionnairesTabRoute` (tab child for M19 `supplierDetailRoute(extraTabs)`, composed in the router). |
| Depends on | `identity` (`hashToken`, `TTL`, `decidePermission`), `workspaces` (company read model, entitlement), `audit` (`AuditService`), `reference-data` (global template lookup by key@version — fake `FakeReferenceTemplates`), `files` (upload intent, file read model with scan status — fake `FakeFiles`), `notifications` (`EventBus.publish`, `OnDomainEvent`, `notify()`, `sendEmail()`, `emailStatuses()` — fake `FakeNotifications`), `supplier-register` (`getSupplier`, `listSuppliers` for recipient resolution — fake `FakeSupplierRegister`). Kernel `src/common/forms` (FormDefinition, planned). No dependency on `supplier-portal` (events only). |
| Emits | `questionnaire.sent`, `questionnaire.submitted`, `questionnaire.reviewed`, `questionnaire.overdue`, `questionnaire.shared` (payloads §10) |
| Consumes | `supplier.linked` → link projection, move open token assignments in-app; `supplier_access.revoked` → revoke shares, hide answers; `supplier.archived` → cancel open assignments; `file.scanned` → recompute evidence points; `reassessment.due` (`kind = 'questionnaire'`, monitoring) → supplier added to a `source = 'monitoring'` draft campaign |
