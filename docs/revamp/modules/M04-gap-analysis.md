# M04 — Gap Analysis (ISO 26000 self-assessment)

> Status: Draft · Phase: 2 · Depends on: M01–M03, M13 (question library), M14 (files) · Blocks: M05, M09, M10 (supplier results), M11
> Legacy code: BE `server/models/gapAnalysis.js`, `schema/mutations/gapAnalysis/_helper.js` (scoring), `helpers/utils.js` (`absValue`), `controllers/gab.js` · FE `gapAnalysis/*` (esp. `IssueOfInterest.js` custom scoring, `_helper.js` readiness), `common/gapAnalysisQuestions.js`, `common/enum/{weight,issueLevel}.js` · Content: `CSR_BE/Docs/GapAnalysisV2.xlsx` (sheet "GapAnalysis v3 PS")

## 1. Purpose
The company assesses its current CSR performance and the relevance of each ISO 26000 **key consideration (KC)**, attaches evidence, and gets a weighted performance score per issue, core subject and overall — the baseline for materiality, actions and supplier ranking.

## 2. Users & permissions

| Role | Can |
|---|---|
| workspace_admin / project lead | Everything below + submit for review, assign sections |
| contributor | Answer KCs and upload evidence **within assignments** |
| viewer / auditor | Read answers, scores, evidence |
| platform_assessor | Read during review (M05) |
| buyer company (supplier link with results access) | Read-only results of the supplier's completed project (M10) |

## 3. Current state (legacy)
- 609 KCs across 7 core subjects / 41 issues live in an 8,000-line FE file; the server stores only keys and never validates them.
- Nested expandable tables with ~609 rows; every cell autosaves and pops a toast; three icons per row; tooltips describe a 0–4 scale while most dropdowns are Yes/No.
- Custom scoring for 5 numeric KCs runs in the browser; KC-level `customField` isn't in the schema (last write wins at issue level).
- Readiness % uses the FE question count as denominator; submission gating is FE-only.
- Weights are recomputed lazily; a KC never touched is ignored in denominators; relevance 0 wipes the KC; division by zero → NaN; `note` cannot be cleared.
- No per-question assignment, comments, history, or import/export.

## 4. Scope
### 4.1 Must have (parity + fixes)
- **Question library** (global, versioned, translatable; managed in M13): core subjects → issues of interest → KCs with `code` (e.g. `1_1_1`), `legacy_key` (`v_1_1_1_1`), label, evidence guidance (`doclabel`), group, order, `answer_type`, `evidence_required`, `scoring_rule`.
- **Answer types** (from the workbook's *Dropdown / answer options / backend scores* columns and FE custom components):
  | `answer_type` | Input | Performance `p` (0–4) |
  |---|---|---|
  | `yes_no` (576 KCs) | Yes / No | Yes → 4, No → 0 |
  | `legal_3` (e.g. `v_1_1_2_3`, `v_1_3_2_14`) | No / Yes, by law / Yes, beyond law | 0 / 2 / 4 |
  | `does_3` (`v_1_5_2_4`) | Does / Does not (label variant) | per library row |
  | `ratio_band` (`v_1_2_4_3` grievances resolved ÷ reported; `v_1_7_5_1` local employees ÷ total; `v_1_7_5_2` % locally sourced) | two numbers or a % | band rule §7.2 |
  | `gender_pay_gap` (`v_1_3_2_19`) | average male & female pay for top management, management, workforce | §7.3 |
  | `yes_count` (`v_1_1_5_1`) | Yes/No + "how many" | Yes/No mapping, count stored |
  | `header` (25 rows) | none — grouping row | not scored |
- **Relevance & significance** 0–5 per KC (0 = not relevant → KC excluded).
- Notes per KC (clearable), evidence linking (M14): link existing file(s), upload new, or declare **"no document needed"** / **"no related document available"** (semantics in M05 §7).
- **Server-side scoring engine** (§7) recomputed on every answer change inside a transaction; results stored per KC/issue/core subject/project.
- Readiness check (§7.4) used by the M03 transition guard and the UI.
- Edit locks per workstream state (M03 §7).

### 4.2 New
- **Assessment workspace UX** (design-system pattern): navigator tree with progress, one question card at a time or section list, keyboard shortcuts, autosave indicator (no toast per save), "unanswered only" / "missing evidence" / "assigned to me" filters, bulk "mark N/A (relevance 0)" for an issue.
- **Assignments** (M03) at core subject / issue / KC level; "Assigned to me" inbox.
- **Comments & mentions** per KC (M12), resolved/unresolved.
- **Answer history** (who changed what, when; revert).
- **Carry forward** from last year's project (flagged "needs confirmation").
- **Import/Export**: XLSX export of all answers (for offline work and consultants) and re-import with validation report.
- **Framework chips** on each KC (M16) and **AI evidence analysis** (M17).
- Applicability: KCs can be marked "not applicable to our sector" at issue level with reason (distinct from relevance 0), excluded from denominators.

### 4.3 Out of scope
- Custom per-workspace questions in 2.0 (planned via M13 "custom question packs" later).

## 5. User stories & acceptance criteria
- **US-04-1** As a contributor assigned *Labour practices* I open "Assigned to me", answer 20 KCs with keyboard only, and see progress update without page reload; each save < 300 ms p95; offline/network errors show a retry banner and keep my input.
- **US-04-2** For `v_1_3_2_19` I enter average pay per tier; the server computes the gap per tier, the weighted score and shows the band; entering female > male pay (negative gap) yields score 4 (**intentional change**; legacy returned undefined).
- **US-04-3** Setting relevance 0 asks for confirmation if an answer or evidence exists; evidence links are kept (not deleted) but excluded; restoring relevance restores them (**intentional change**; legacy unlinked the file).
- **US-04-4** "Submit for documentation review" lists blockers grouped by core subject with deep links.
- **US-04-5** I export answers to XLSX, fill 50 rows offline, re-import; invalid rows are reported with row number and reason; valid rows are applied in one transaction.

## 6. Domain model
Reference (global, versioned — owned by M13):
```ts
taxonomy_versions { id, code 'ISO26000-v3', published_at, status }
core_subjects     { id, version_id, key text (legacy key e.g. 'organizationalGovernance'), code '1', order, label_key }
issues            { id, version_id, core_subject_id, key text (legacy key incl. typos, e.g. 'avoindanceOfComplicity'), code '1_1', order, label_key }
key_considerations{ id, version_id, issue_id, code '1_1_1', legacy_key 'v_1_1_1_1', order, group_label_key?, label_key, evidence_hint_key,
                    answer_type, answer_options jsonb, scoring_rule jsonb, evidence_required boolean default true, is_header boolean }
```
Tenant data:
```ts
gap_assessments { id, workspace_id, project_id unique, taxonomy_version_id, overall_performance numeric(6,3)?, overall_relevance numeric(6,3)?,
                  overall_revised numeric(6,3)?, computed_at }
gap_answers     { id, workspace_id, assessment_id, kc_id, performance_input jsonb   -- raw inputs (choice / numbers)
                  performance_value numeric(4,2)?  -- p, 0..4 after scoring rule
                  relevance smallint check (0..5)?, note text?, evidence_mode: 'files'|'no_document_needed'|'no_related_document'|null,
                  applicability: 'applicable'|'not_applicable', na_reason?, carried_forward boolean, confirmed_at?,
                  answered_by, answered_at, version int, unique(assessment_id, kc_id) }
gap_answer_files{ answer_id, file_id, workspace_id, primary key(answer_id, file_id) }
gap_scores      { id, workspace_id, assessment_id, level: 'kc'|'issue'|'core_subject', ref_id, performance numeric, relevance numeric,
                  relevance_weight numeric, weight numeric, issue_level smallint?, revised_score numeric?, revised_weight numeric?,
                  revised_performance smallint?, unique(assessment_id, level, ref_id) }   -- derived, rebuilt by engine
gap_answer_history { id, workspace_id, answer_id, changed_by, changed_at, diff jsonb }       -- append-only
```
Multiple files per KC are allowed (legacy: one).

## 7. Business rules & calculations (engine: `src/modules/gap-analysis/engine/`)
Pure functions; inputs are plain objects; golden-master tested against legacy stored values.

### 7.1 Weighting (legacy parity — `gapAnalysis/_helper.js`)
Let a KC have performance `p` (0–4) and relevance `r` (0–5). Only **answered, applicable KCs with r > 0** participate.
- `a = clamp(p, 0, 4)` — legacy used `a = 4 − |4 − p|` (identity for 0–4, folds > 4 back). New inputs are validated to 0–4, so `a = p`. **Open question** in `00-current-state-review.md` §6.1 about six workbook rows scored 5–10: they are re-mapped to 0–4 in the library.
- KC: `relW_kc = r / Σ r (KCs of the issue)`; `W_kc = (a / 4) · relW_kc`.
- KC issue level (severity 1–9): `issueLevel = (4 − perfForLevel) + r` where `perfForLevel = revisedPerformance` once reviewed, else `a` (**intentional change:** legacy mixed both inconsistently). `issueLevel > 5` ⇒ **Major**, else Minor.
- Issue: `perf_issue = Σ W_kc`; `rel_issue = mean(r) / 5`; `relW_issue = rel_issue / Σ rel_issue (issues of the core subject)`; `W_issue = perf_issue · relW_issue`.
- Core subject: `perf_cs = Σ W_issue`; `rel_cs = mean(rel_issue)`; `relW_cs = rel_cs / Σ rel_cs (all core subjects)`; `W_cs = perf_cs · relW_cs`.
- Project: `overall_performance = round(Σ W_cs × 100, 1)`; `overall_relevance = round(mean(rel_cs) × 100, 1)`.
- Empty denominators → value `null` ("not enough data"), never NaN.
- All weights are **recomputed for the whole assessment** on each change (legacy recomputed lazily and missed siblings of newly created nodes).

### 7.2 Ratio band rule (`ratio_band`)
`pct = numerator / denominator × 100` (denominator > 0 required; pct clamped to 0–100):
`[0,20) → 0 · [20,40) → 1 · [40,60) → 2 · [60,80) → 3 · [80,100] → 4`.

### 7.3 Gender pay gap (`gender_pay_gap`)
Per tier t ∈ {top management, management, workforce}: `gap_t = (avg_male_t − avg_female_t) / avg_male_t × 100`. Weighted `gap = mean(gap_t)` over tiers with data (legacy: equal 33/33/33).
Score: `gap ≥ 60 → 0 · [41,60) → 1 · [21,41) → 2 · [1,21) → 3 · (< 1, incl. negative) → 4`. (Legacy bands kept; the 40–41 and 20–21 half-open edges are preserved exactly.)

### 7.4 Readiness (submission guard)
Blockers returned by `GET /projects/:id/gap/readiness`:
- applicable, non-header KC without `performance_value` or without `relevance`;
- KC with `relevance > 0`, `evidence_required`, and `evidence_mode` null (no file linked and no declaration);
- file linked but not yet uploaded/scanned clean (M14).
Progress % = answered applicable KCs ÷ applicable non-header KCs (server-side denominator from the library — not the FE file).

### 7.5 Carry forward
Copy `performance_input`, `relevance`, `note`, evidence links (files are shared, not copied) with `carried_forward = true`; they count as answered but show "confirm"; submission requires confirmation of all carried-forward answers (configurable per project).

## 8. API contract (REST `/v1`)

| Route | Permission |
|---|---|
| `GET /taxonomy/:version` (tree with labels in requested locale; cacheable, ETag) | authenticated |
| `GET /projects/:id/gap` (assessment summary + scores tree) | `project:read` |
| `GET /projects/:id/gap/answers?filter[coreSubject]=&filter[state]=unanswered|missing_evidence|assigned_to_me` | `project:read` |
| `PUT /projects/:id/gap/answers/:kcCode` `{ performanceInput, relevance, note, evidenceMode, applicability, version }` → answer + updated scores for issue/core subject/overall | `gap:answer` + assignment + state lock; optimistic concurrency via `version` (409 on conflict) |
| `POST /projects/:id/gap/answers/:kcCode/files` `{ fileIds }` · `DELETE …/files/:fileId` | `evidence:upload` |
| `POST /projects/:id/gap/answers:bulk` (e.g. mark issue N/A) | `gap:answer` |
| `GET /projects/:id/gap/answers/:kcCode/history` | `project:read` |
| `GET /projects/:id/gap/readiness` | `project:read` |
| `GET /projects/:id/gap/export.xlsx` · `POST /projects/:id/gap/import` (async job) | `report:export` · `gap:answer` |

## 9. UI
- Route `/projects/:id/gap` → **Assessment workspace** (design system §5): navigator (7 core subjects with coloured dot from the fixed categorical slot, issue list with `answered/total` and a warning dot for missing evidence), question card (code chip `1_1_2`, label, evidence hint, answer control by `answer_type`, relevance segmented control 0–5 with labels "Not relevant … Critical", note, evidence list with drop zone and the two declarations), context panel tabs (Guidance · Evidence · Comments · History · AI).
- Overview tab `/projects/:id/gap/overview`: stat tiles (overall performance, relevance, % complete, evidence coverage), horizontal bar chart per core subject, table of issues with performance/relevance/major-issue count.
- Sticky footer: completion ring, "Submit for review" (disabled with tooltip listing blocker count).
- Read-only mode (under review/completed) shows assessor results inline (M05).
- Mobile: navigator becomes a sheet; one question per screen.

## 10. Events, notifications & audit
`gap.answer.updated` (debounced into activity feed per user/session), `gap.evidence.linked|unlinked`, `gap.submitted`; notifications to assignees on assignment, to lead when a section is complete.

## 11. Migration
- Library: seed from `Docs/GapAnalysisV2.xlsx` (+ labels from `Resilisense-FE/src/common/gapAnalysisQuestions.js`, which is the version actually rendered) with `legacy_key` = FE value `v_1_<cs>_<ioi>_<n>`; verify 609 KCs / 41 issues / 7 core subjects; per-core-subject counts OG 42, HR 105, LP 103, ENV 74, FOP 87, CI 142, CID 56.
- Tenant: legacy embedded tree `gapAnalysis.coreSubjects[].issueOfInterests[].keyConsiderations[]` → `gap_answers` (+ `customField` values from the issue level into `performance_input` where recoverable); `file` → `gap_answer_files`; stored weights → used only for golden-master comparison, then recomputed.

## 12. Test plan
- Engine: table-driven tests for each answer type and band edge (19.99, 20, 40, 40.5, 41, 60, negative gap), empty denominators, relevance 0, N/A.
- Golden master: for every legacy project with stored `weightedPerformance`/`relevance`, the engine reproduces them within ±0.1 (rounding) or the difference is explained.
- API: lock enforcement per state; assignment scoping; optimistic concurrency.
- E2E + a11y: keyboard-only answering of an issue; screen-reader labels on answer controls.

## 13. Open questions
- Six workbook rows with backend scores 5–10 — correct mapping to 0–4?
- Should "no document needed" require assessor confirmation (it currently removes the documentation penalty entirely — see M05)?
