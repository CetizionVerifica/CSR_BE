# Questionnaires (M21 · SD04)

> Spec: `docs/revamp/modules/M21-questionnaires.md` · Status: Draft · Wave: 2

## Purpose

Buyers send supplier self-assessment questionnaires (SAQ) from versioned templates to many suppliers, suppliers answer in-app (linked) or by token link (off-platform), and a pure engine scores every answer. Linked suppliers answer once and share the response with many buyers. Everything here is planned; nothing is built yet.

## Owns

- Tables (all `workspace_id`, RLS `ENABLE` + `FORCE`, migration `prisma/migrations/*_questionnaires`): `questionnaire_campaigns`, `questionnaire_assignments`, `questionnaire_responses`, `questionnaire_answers`, `questionnaire_requests` (supplier inbox row), `questionnaire_shares` (supplier side), `questionnaire_supplier_links` (projection of `supplier.linked`), `questionnaire_comments`. Columns: M21 §6.2. FKs only to `companies`, `users`, `files`; `supplier_id`, `supplier_workspace_id`, `buyer_workspace_id` are plain uuids.
- Routes (M21 §8), all `/v1`:

| Routes                                                                                                                                                                                                                         | Guard                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `GET /questionnaire-templates`, `GET /questionnaire-campaigns[/:id]`, `…/recipients`, `…/stats`, `GET /questionnaire-responses/:id`, `GET /suppliers/:sid/questionnaire-summary`, `GET /companies/:cid/questionnaire-progress` | `@Can('questionnaire:read')`                         |
| `POST/PATCH /questionnaire-campaigns[/:id]`, `PUT …/recipients`, `POST …/{send,remind,close,reopen,test-email}`, `PATCH/POST /questionnaire-assignments/:id[/cancel]`, review/accept/return on responses                       | `@Can('questionnaire:manage')`                       |
| `GET …/export.xlsx`                                                                                                                                                                                                            | `@Can('dd_report:export')`                           |
| `/questionnaire-requests*`, `/my-questionnaire-responses*`                                                                                                                                                                     | `@Can('questionnaire:answer')`                       |
| `/public/questionnaires/:token*`                                                                                                                                                                                               | `@Public()` + `RateLimiter` (per token, per IP hash) |

- Permissions to add to the M01 matrix (`identity/engine/permissions.ts`): `questionnaire:read` (owner, admin, viewer, auditor, partner_admin, platform_owner), `questionnaire:manage` (owner, admin, partner_admin, platform_owner), `questionnaire:answer` (owner, admin, contributor). Entitlement `due_diligence` for read/manage; none for answer (M21 §13.3).
- Problem types used: `invalid_token`, `invalid_state_transition`, `validation_failed`, `rate_limited` (all exist).
- Queue: `questionnaires` (planned constant in `src/infra/queue/queues.ts`).

## Public surface (`index.ts`)

| Export (planned)                                                                                                                                                                             | Why                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `QuestionnairesModule`                                                                                                                                                                       | `app.module.ts` / `worker.ts`                                                           |
| `QuestionnaireEvents`                                                                                                                                                                        | names of the events risk, monitoring, dd-reporting consume                              |
| `QuestionnaireSummaryQuery` (`latestAcceptedBySupplier(wid, sid)`, batch `latestAcceptedForSuppliers(wid, sids, { year? })`, `progressFor(wid, cid, sids)`) → `SupplierQuestionnaireSummary` | screening, dd-reporting (and risk backfill) read scores and progress without our tables |
| `CampaignReadModel`, `ResponseReadModel` (types)                                                                                                                                             | dd-reporting exports                                                                    |
| `scoreResponse`, `ScoreResult` (pure)                                                                                                                                                        | parity tests of report numbers                                                          |

## Depends on

| Module              | Uses                                                                                                         | Fake (`__tests__/fakes/`)     |
| ------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| `identity`          | `hashToken`, `TTL`, `decidePermission`                                                                       | real (built)                  |
| `workspaces`        | company read model, `due_diligence` entitlement check (planned exports)                                      | real (built)                  |
| `audit`             | `AuditService.record`                                                                                        | real (built)                  |
| `reference-data`    | global template by `key@version`, list by topic                                                              | `fake-reference-templates.ts` |
| `files`             | public/auth upload intent (purpose `questionnaire_evidence`), file read model + scan status                  | `fake-files.ts`               |
| `notifications`     | `notify()`, `sendEmail()` (token respondents), `emailStatuses()`, `EventBus.publish` + `@OnDomainEvent`      | `fake-notifications.ts`       |
| `supplier-register` | `getSupplier`, `listSuppliers` (name, contact email, language, platform status)                              | `fake-supplier-register.ts`   |
| kernel              | `FormDefinition` Zod schema in `src/common/forms/definition.ts` (planned; created by this module's first PR) | —                             |

Never imports `supplier-portal`: its decisions arrive as events.

## Events

- Emits: `questionnaire.sent`, `questionnaire.submitted`, `questionnaire.reviewed` (with `templateKey`, `templateVersion`), `questionnaire.overdue`, `questionnaire.shared` (payloads M21 §10; never answer text).
- Consumes: `supplier.linked` → upsert `questionnaire_supplier_links`, switch open token assignments to `in_app` (answers kept); `supplier_access.revoked` → revoke shares, set `answers_hidden_at` on buyer copies; `supplier.archived` → cancel open assignments; `file.scanned` → rescore responses whose evidence changed; `reassessment.due { kind: 'questionnaire', supplierId, templateRef }` (monitoring) → add the supplier to a `source = 'monitoring'` draft campaign for that template (one per company, template and month), never sent automatically.

## Components & behaviour

- `campaigns.service.ts` — wizard drafts, snapshot `definition` from reference-data at send, recipients via `getSupplier` (skip and report suppliers without contact email or link), send in one transaction + `send` job (Idempotency-Key), close/reopen (M21 §7.1).
- `assignments.service.ts` — the only place that changes assignment status; validates transitions (`engine/assignment-state.ts`, pure), writes audit, emits events; `409 invalid_state_transition` otherwise.
- `responses.service.ts` — autosave (`PUT` one answer, only `in_progress`), submit (required check → `422` with missing keys, then `scoreResponse`), review per answer, override with reason, accept/return; scores never accepted from bodies (Zod `.strict()`).
- `sharing.service.ts` — reuse eligibility (M21 §7.4), share + buyer copy through `SharedResponsesRepository.copyToBuyer` (the one audited cross-tenant method), revocation.
- `public-questionnaires.controller.ts` — token lookup by SHA-256, uniform `404 invalid_token` for unknown/expired/revoked, branding + definition in requested language.
- `engine/score.ts` — formula M21 §7.2 (visible questions, N/A excluded, bands, evidence points only for `ready` files, overrides, section weights, half-up 1 decimal at the end, critical flags); `engine/visibility.ts` (`showIf`); fixtures `engine/__fixtures__/<template>.json`. Details in a part card `engine/CLAUDE.md` if it grows.
- Processors (`worker.ts`): `questionnaire-send` (emails via `notifications`, batches of 50), `questionnaire-reminders` (repeatable hourly: day offsets, ≤ 3, only not-submitted), `questionnaire-overdue` (daily, emits once per assignment), `questionnaire-export` (XLSX).
- Repositories: `campaigns.repository.ts`, `assignments.repository.ts`, `responses.repository.ts`, `shared-responses.repository.ts` — Prisma only here, inside `prisma.withTenant`.

## Invariants

- A buyer reads supplier-owned responses only via a non-revoked `questionnaire_shares` row; RLS never disabled.
- Scores exist only as engine output; `0 ≤ score ≤ 100` or `null`; recomputed on submit, override and `file.scanned`, never on read.
- Accepted responses and sent definitions are immutable; tokens stored hashed only.
- Reminders never go to submitted, accepted, declined or cancelled assignments.

## Tests

- Unit: `engine/score.spec.ts`, `engine/score.property.spec.ts`, `engine/assignment-state.spec.ts`, `engine/visibility.spec.ts`.
- E2e (planned): `test/questionnaires-campaigns.e2e-spec.ts` (US-21-1, -4, -9), `test/questionnaires-public.e2e-spec.ts` (US-21-2, -3, -5), `test/questionnaires-review.e2e-spec.ts` (US-21-6), `test/questionnaires-sharing.e2e-spec.ts` (US-21-7, -8); each with forbidden role, other workspace 404, invalid transition 409. Add `questionnaires` to `spec-coverage.json`.

## Not here

Template authoring of global templates (`reference-data`, M13), materiality surveys (M08), sharing consent per customer/year (`supplier-portal`), risk from scores (`risk`), corrective actions (`corrective-actions`), certificates (`supplier-evidence`), file storage (`files`).
