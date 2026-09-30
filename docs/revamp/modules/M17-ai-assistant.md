# M17 — AI Assistant ("ResiliSense Copilot") · NEW

> Status: Draft · Phase: 3 · Depends on: M04, M06, M08, M11, M14, M16

## 1. Purpose
Cut the manual effort of CSR/ESG assessments without removing human judgement. The assistant reads the evidence customers already upload, suggests answers and scores with citations, summarises stakeholder free-text, and drafts report narratives — every suggestion is reviewed and accepted by a person before it changes official data.

## 2. Users & permissions

| Role | Can |
|---|---|
| Company contributor | Request evidence analysis on own questions; accept/reject suggestions on own answers |
| Company admin | Everything above; enable/disable AI for the org; view AI usage |
| Agency assessor | Request pre-review analysis on submitted assessments; accept suggested scores as *proposals* (still requires the assessor's explicit confirmation) |
| Platform admin | Configure model, quotas, prompt versions; view cost dashboards |

Permission keys: `ai:use`, `ai:configure`, `ai:usage:read`.

## 3. Scope
### 3.1 Features (in priority order)
1. **Evidence analyser (gap analysis)** — for a question (e.g. `1_1_1 Organisation has a code of ethics/conduct in place`) and its attached files, return: suggested answer (Yes/No/Partial/N/A), suggested performance score on the question's scale, a 1–3 sentence rationale, and **page-level citations** into the evidence PDFs. Also flags "evidence does not support the answer given" on already-answered questions.
2. **Bulk pre-assessment** — run the analyser over all questions of a project that have evidence (batch, overnight), producing a review queue for the assessor (M05) sorted by confidence/disagreement.
3. **Survey insights** — summarise open-text survey answers per stakeholder group and per issue: themes, sentiment, representative quotes (with respondent anonymity preserved), and suggested new issues of interest.
4. **Narrative drafting (reports)** — draft the text sections of the gap-analysis report, materiality report and sustainability report (M11/M16) from structured results; each paragraph links to the data points it used.
5. **Action-plan suggestions** — for low-scoring issues, propose SMART actions and KPIs (M09) drawn from a curated library; user picks and edits.
6. **Ask ResiliSense** (Phase 4) — chat over the org's own data and the framework library ("Which ESRS S1 datapoints are we missing?"), read-only tools, answers with links.

### 3.2 Out of scope
- Auto-submitting answers or scores without human confirmation.
- Training or fine-tuning on customer data.
- Using one tenant's data to answer another tenant's questions.

## 4. User stories & acceptance criteria
- **US-17-1** As a contributor answering a gap question, I want to click "Analyse evidence" so that I get a suggested answer with the exact pages that support it.
  - AC: suggestion appears in the context panel within 30 s for ≤ 50 pages; shows answer, score, rationale and ≥ 1 citation (file name + page) or states "no supporting evidence found"; "Accept" copies answer + score into the draft with `source = ai_suggestion` and the suggestion id; "Reject" asks for an optional reason.
- **US-17-2** As an assessor, I want a pre-review queue sorted by "AI disagrees with the self-assessment", so that I spend time where it matters.
- **US-17-3** As a company admin, I want to see AI usage (runs, tokens, cost estimate) per month and to switch AI off for my organisation.
- **US-17-4** As a survey owner, I want an insights panel summarising free-text answers with quotes, so I can feed new issues into materiality.
- **US-17-5** As a report author, I want to generate a draft narrative for a section and edit it before publishing; generated text is visibly marked until edited/approved.

## 5. Domain model
```ts
ai_jobs        { id, workspace_id, project_id?, kind: 'evidence_analysis'|'bulk_pre_assessment'|'survey_insights'|'narrative'|'action_suggestions',
                 status: 'queued'|'running'|'succeeded'|'failed'|'cancelled', input jsonb, model, prompt_version,
                 input_tokens, output_tokens, cache_read_tokens, cost_usd_estimate numeric(10,4), error jsonb?, requested_by, created_at, finished_at? }
ai_suggestions { id, workspace_id, job_id, target_type: 'gap_answer'|'survey_theme'|'report_section'|'action', target_id,
                 payload jsonb, citations jsonb /* [{ fileId, versionId, page, quote }] */, confidence: 'low'|'medium'|'high',
                 status: 'pending'|'accepted'|'rejected'|'superseded', decided_by?, decided_at?, reject_reason? }
ai_settings    { workspace_id pk, enabled boolean default false, monthly_budget_usd numeric?, features jsonb }
```
Indexes: `ai_jobs (workspace_id, created_at)`, `ai_suggestions (workspace_id, target_type, target_id, status)`.

## 6. Technical design
- **SDK:** `@anthropic-ai/sdk` (official TypeScript SDK) calling the **Anthropic API directly** (not via Amazon Bedrock — no AWS, ADR-011) inside `src/infra/ai/anthropic.client.ts`; all calls go through `AiService` (no direct SDK use in feature modules).
- **Model:** default `claude-opus-5-5` for every route; model id is a config value per feature (`AI_MODEL_EVIDENCE`, `AI_MODEL_SURVEY`, …) so a cheaper model can be evaluated later against the eval set (§9) — change it only when measurements show quality holds. Use adaptive thinking (default) and set `output_config.effort` explicitly per route (start at `medium`; raise only if the eval shows headroom). Use streaming for long inputs/outputs.
- **Refusals:** check `stop_reason` before reading content; handle `refusal` gracefully (job → `failed` with a user-readable message) and enable the server-side `fallbacks` option.
- **Evidence input:** PDFs sent as `document` content blocks (Files API for files reused across questions of the same project, so each evidence file is uploaded once); `citations: { enabled: true }` on each document to get page-level `page_location` citations.
  - Note: citations cannot be combined with structured-output `output_config.format`. The evidence analyser therefore runs **two steps**: (1) cited analysis in text; (2) a small structured-output call (JSON schema: answer, score, confidence, rationale) over step 1's text. Citations from step 1 are stored verbatim.
- **Structured outputs** (`output_config.format` / `messages.parse` with Zod) for every machine-consumed result (survey themes, action suggestions, scores).
- **Prompt caching:** stable prefix = system prompt + methodology/question library + the evidence documents; the question-specific instruction goes last so bulk runs over one project re-use the cached evidence.
- **Worker placement:** all AI calls run in the `ai` BullMQ queue (never in the request path), with per-workspace concurrency limits.
- **Batch API** for `bulk_pre_assessment` and `survey_insights` (non-urgent, ~50 % cheaper); poll via the `ai` BullMQ queue; results keyed by `custom_id` = `AiSuggestion` target id.
- **Tenancy & privacy:** one request never mixes documents from two orgs; respondents' personal data (names, emails) stripped before survey text is sent; PII redaction step on free text; per-org opt-in; data processing terms updated; check the org's contractual data-retention requirement before enabling (some models require standard retention and are unavailable under zero-data-retention arrangements).
- **Prompt management:** prompts live in `src/modules/ai-assistant/prompts/*.md` with a semantic `promptVersion`; every suggestion records `model` + `promptVersion`.
- **Cost control:** per-org monthly budget; hard stop at 100 %, warning at 80 %; token usage stored per job.

## 7. API contract (REST `/v1`)

| Route | Permission |
|---|---|
| `POST /projects/:pid/gap/answers/:kcCode/ai-analysis` `{ fileIds? }` → 202 job | `ai:use` + `gap:answer` |
| `POST /projects/:pid/gap/ai-pre-assessment` → 202 job (batch) | `ai:use` + `gap:review` or admin |
| `POST /surveys/:id/ai-insights` → 202 job | `ai:use` |
| `POST /report-documents/:id/sections/:key/ai-draft` → 202 job | `ai:use` + `report:edit` |
| `GET /ai/jobs/:id` · `GET /ai/jobs/:id/stream` (SSE progress) | job owner / `project:read` |
| `GET /ai/suggestions?targetType=&targetId=` · `POST /ai/suggestions/:id/accept` · `POST /ai/suggestions/:id/reject` `{ reason? }` | target write permission |
| `GET/PUT /workspaces/current/ai-settings` | `ai:configure` |
| `GET /workspaces/current/ai-usage?month=` | `ai:usage:read` |

## 8. UI
- Gap workspace context panel → "AI" tab: button *Analyse evidence*, streaming status, suggestion card (answer chip, score, rationale, citation chips that open the PDF viewer at the page), *Accept* / *Reject*.
- Assessor review queue (M05) → column "AI view" with agreement indicator.
- Survey results → "Insights" tab (themes list with counts, quotes, "Add as issue of interest").
- Report editor → "Draft with AI" on each section; generated text has a subtle "AI draft" label until edited.
- Visual language: a single sparkle icon + "AI suggestion" label; never styled as final data.

## 9. Quality & evaluation
- Build an eval set before launch: ≥ 150 real (anonymised) question/evidence pairs with assessor-confirmed answers; metrics: answer agreement, score MAE, citation precision (does the cited page actually support the claim?).
- Launch gate: agreement ≥ 80 % and citation precision ≥ 90 % on the eval; re-run on every prompt/model change (CI job with a small sample, full run before release).
- Online: track accept/reject rates per feature and prompt version.

## 10. Events, notifications & audit
- Audit: `ai.job.requested`, `ai.suggestion.accepted`, `ai.suggestion.rejected` (with actor and target).
- In-app notification when a bulk job completes.

## 11. Open questions
- Which customers/regions need EU data residency for AI processing?
- Commercial packaging: AI included in a premium plan or metered?
