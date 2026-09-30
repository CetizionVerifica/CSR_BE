# M05 — Documentation Assessment (platform assessor review)

> Status: Draft · Phase: 2 · Depends on: M03, M04, M14 · Blocks: M10 (supplier results), M11
> Legacy code: BE `schema/mutations/gapFile/update.js` (`updateFile`), `schema/mutations/project/update.js` (`submitProjectAssessmentStatus`), `schema/mutations/gapAnalysis/_helper.js` (`updateKeyConsiderationRevisingScore`), `controllers/assessment.js` (notification emails) · FE `projectAssessment/*` (queues, `FileAssessment.js`, `utility.js getFileScore`), `gapAnalysis/DocAssessmentReport.js`, `common/assessmentCriteria.js`

## 1. Purpose
Independent verification of the company's self-assessment. A ResiliSense/CSRC **platform assessor** checks every evidence document against quality criteria and whether it really supports the linked key considerations. The result is a **revised (verified) score** that is more credible than the self-assessment and is what buyers see in supplier ranking. Legacy runs two rounds: the company can improve evidence after round 1.

## 2. Users & permissions
| Role | Can |
|---|---|
| platform_assessor | See review queue across tenants (only projects in `submitted_*`/`in_review_*`), claim a project, assess files, comment, complete a round |
| platform_owner | Everything + reassign, reopen a completed review (audited, reason required) |
| workspace members | See review status; after each round: file-level results, comments and revised scores |
| third_party_auditor (new, review mode `third_party_auditor`) | Same as assessor but only for projects that invited them |

## 3. Current state (legacy)
- Queue screen with 4 stacked tables (first request, second request, first completed, completed).
- Assess screen: PDF viewer in a modal + Y/N for *Authentic*, *Up to date*, *Communicated* and Y/N "addresses this KC" for each linked KC (`updateFile` writes `criteria[{name, value}]`).
- **The browser computes each KC's revising score (`getFileScore`) and posts it** with the status change → tamperable. `DocAssessmentReport` uses a *different* file-score formula.
- Files are locked after assessment; re-linking a file silently re-opens it.
- Emails to the assessor inbox and company are triggered by the FE via separate REST calls.
- Uses `pdfjs-dist 2.0.305` (CVE-2024-4367).

## 4. Scope
### 4.1 Must have
- **Review queue** (platform): DataTable with company, project, round, submitted at, SLA due (e.g. 10 business days), files count, progress, assignee; filters; claim/assign.
- **Review workspace**: split view — secure PDF/image viewer (pdf.js ≥ 4 in a sandboxed iframe, or server-rendered page images) on the start side; on the end side the criteria for the file and the list of KCs it is linked to, each with *Addresses KC? Yes / Partly / No* (Partly is new, see §7) and an optional comment to the company.
- **Server-side scoring** (§7) — the client never sends scores.
- Round completion: guard "all linked files assessed"; freezes round results (`doc_assessment_rounds`); emails + in-app notifications sent by the server.
- Company view after a round: per file criteria results, per KC revised score and band, assessor comments; "what to improve before round 2" list (KCs with low revised score, ordered by issue level).
- **Documentation Assessment Report** (M11): project card, per issue KCs with initial vs revised performance, per file breakdown — one formula everywhere.
- Re-linking or replacing evidence between rounds marks only the affected file/KC pairs as "needs re-assessment" (explicit, visible).

### 4.2 New
- Assessor checklists & canned comments; time tracking per review (for SLA reporting).
- Sampling mode for large projects (assess a statistically chosen subset) — later.
- AI pre-review suggestions (M17) shown to the assessor only, never auto-applied.

## 5. User stories & acceptance criteria
- **US-05-1** As an assessor I claim "Acme 2026 — round 1", open file 3/18, mark criteria and KC coverage with keyboard shortcuts, and move to the next file; my progress persists across sessions.
- **US-05-2** When I complete the round, the server computes revised scores, sets the workstream to `reviewed_r1`, and notifies the company; I cannot complete while any linked file is unassessed (409 with list).
- **US-05-3** As a company admin I see "Round 1 complete: verified score 58.2 (self-assessed 71.0)", the files with issues and the assessor's comments.
- **US-05-4** Posting a crafted score from the browser has no effect (no such field in the API).

## 6. Domain model
```ts
doc_assessment_rounds { id, workspace_id, project_id, round smallint (1|2), assessor_user_id?, status: 'queued'|'in_review'|'completed',
                        submitted_at, claimed_at?, completed_at?, sla_due_at, verified_overall numeric(6,3)?, unique(project_id, round) }
file_assessments      { id, workspace_id, round_id, file_id, authentic boolean?, up_to_date boolean?, communicated boolean?,
                        comment?, assessed_by?, assessed_at?, needs_reassessment boolean default false, unique(round_id, file_id) }
file_kc_assessments   { id, workspace_id, file_assessment_id, kc_id, addresses: 'yes'|'partly'|'no'|null, comment?, unique(file_assessment_id, kc_id) }
kc_verified_scores    { id, workspace_id, round_id, kc_id, revising_score numeric(5,4), revised_score numeric(6,4), revised_weight numeric,
                        revised_performance smallint, basis: 'file'|'no_document_needed'|'no_related_document'|'missing' }
```
Round results are immutable after `completed` (a reopen creates a new version row, audited).

## 7. Business rules & calculations (engine: `src/modules/doc-assessment/engine/`)

### 7.1 File score for a KC (legacy `utility.js getFileScore`)
Criteria: `authentic`, `up_to_date`, `communicated` (20 points each) + KC coverage (40 points).
- If the file **addresses** the KC: `score = 20·authentic + 20·up_to_date + 20·communicated + 40` (0–100).
- If it does **not** address the KC: `score = 25` (legacy overwrites the sum with 25 regardless of criteria).
- **New `partly`** option: `score = 20·authentic + 20·up_to_date + 20·communicated + 20` (**intentional change**, proposal — requires product sign-off; otherwise hide "Partly").
- KC linked to several files (new): use the **maximum** score of its files.
`revising_score = score / 100`.
> The `DocAssessmentReport` per-file "overall" formula (`20/20/20 + 40 × share of the file's KCs addressed`) is kept only as a **file-level** summary metric, clearly labelled, and computed server-side.

### 7.2 Multiplier per KC (legacy `updateKeyConsiderationRevisingScore`)
| KC evidence situation | multiplier `m` |
|---|---|
| file(s) linked | `revising_score` from §7.1 |
| declared **no related document available** | `0.25` (documentation missing → capped at 25 %) |
| declared **no document needed** | `1` (no penalty) |
| nothing linked, nothing declared (should be impossible after readiness check) | `0` (**intentional change** — legacy produced NaN) |

### 7.3 Revised scores (legacy parity)
With `a` = KC performance (0–4) and weights from M04 §7.1:
- KC: `revised_score = m · (a / 4)`; `revised_weight = revised_score · relW_kc`.
- KC band (`revised_performance`, 0–4): `< 0.2 → 0 · [0.2, 0.4) → 1 · [0.4, 0.6) → 2 · [0.6, 0.8) → 3 · ≥ 0.8 → 4`.
- Issue: `revised_score_issue = Σ revised_weight_kc`; `revised_weight_issue = revised_score_issue · relW_issue`.
- Core subject: `revised_score_cs = Σ revised_weight_issue`; `revised_weight_cs = revised_score_cs · relW_cs`.
- Project: `overall_revised = round(Σ revised_weight_cs × 100, 1)` (legacy `revisedWeightValue`).
- Issue level after review uses `revised_performance` (M04 §7.1).

### 7.4 Workflow rules
- Round 2 starts from round-1 assessments: unchanged file↔KC pairs keep their assessment; new/changed ones are `needs_reassessment`.
- After round 2 `completed`, verified scores are final; buyers with results access (M10) see round-2 values (or round-1 if the project uses one round).
- SLA: default 10 business days per round; queue highlights overdue; weekly digest to platform owner.

## 8. API contract (REST `/v1`)
| Route | Permission |
|---|---|
| `GET /reviews?filter[status]=&filter[assignee]=me&sort=sla_due_at` | `gap:review` (platform, cross-tenant read model) |
| `POST /reviews/:roundId/claim` · `POST /reviews/:roundId/assign` `{ userId }` | `gap:review` · platform_owner |
| `GET /reviews/:roundId` (project summary, files, progress) | `gap:review` |
| `PUT /reviews/:roundId/files/:fileId` `{ authentic, upToDate, communicated, comment, kcs: [{ kcCode, addresses, comment }] }` | `gap:review` (round `in_review`, assignee) |
| `POST /reviews/:roundId/complete` | `gap:review`; 409 with unassessed files |
| `POST /reviews/:roundId/reopen` `{ reason }` | platform_owner |
| `GET /projects/:id/doc-assessment` (company view: rounds, per-file results, per-KC verified scores, comments) | `project:read` |
Cross-tenant access for assessors is implemented as an explicit, audited platform query path (separate DB role / `crossTenant()` repository method), never by disabling RLS globally.

## 9. UI
- `/review` (platform area): queue with SLA badges, "Claim" button, filters, saved views.
- `/review/:roundId`: split pane — viewer with page thumbnails, zoom, search in PDF; assessment panel with 3 criteria toggles, KC coverage list (Yes/Partly/No), comment box, "Save & next file" (`Ctrl+Enter`); progress bar; "Complete round" in sticky footer.
- Company side `/projects/:id/gap/review-results`: summary tiles (self-assessed vs verified, delta), bar chart self vs verified by core subject (two series, legend + direct labels), file list with criteria chips, KC table filterable by "revised < self".

## 10. Events, notifications & audit
`review.round.submitted` (from M03 transition) → assessor queue + email to the assessors' shared inbox; `review.round.claimed`; `review.file.assessed`; `review.round.completed` → email + in-app to project lead & admins; `review.round.reopened` (audit, reason).

## 11. Migration
- `gapFile.criteria[{name, value}]` → `file_assessments` (authentic/upToDate/communicated) + `file_kc_assessments` (name = KC key → `addresses` yes/no).
- `assessmentComplete` + project dates (`firstAssessmentDate`, `secondAssessmentDate`) → `doc_assessment_rounds` (legacy did not keep round-1 results separately: import legacy state as the *last completed round* and mark earlier round data "not available").
- Stored KC `revisingScore/revisedScore/revisedWeightValue` → golden-master comparison only.

## 12. Test plan
- Engine: all multiplier cases, score 25 override, band edges (0.19999, 0.2, 0.8), multi-file max, partly.
- Golden master against legacy `revisedWeightValue` per project.
- Security: assessor can only access projects in review states; company users cannot call review endpoints; RLS bypass path audited.
- E2E: submit → claim → assess all → complete → company sees results → round 2.

## 13. Open questions
- Confirm the "25 if not addressed" rule (it ignores the three criteria) and whether "Partly" should exist.
- Should "no document needed" require assessor approval, since it removes the penalty entirely?
- SLA per plan (e.g. 10 vs 5 business days)?
