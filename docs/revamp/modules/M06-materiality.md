# M06 — Materiality Assessment (stakeholder-based + double materiality)

> Status: Draft · Phase: 2 · Depends on: M03, M07, M08, M13 · Blocks: M09, M11, M16 (ESRS materiality), M17
> Legacy code: BE `server/services/materialityFormula.js` (`findScoreWScore`, `findFinalScores`, `sortFinalResults`, `execute`), `controllers/surveys.js` (close → calculate, input builder ~l.941-1045), `schema/mutations/materiality/_helper.js` (manual/legacy credits formula), `models/materiality.js` · FE `materialityAssessment/*` (list, results matrices), `surveys/ViewProjectSurvey.js` (classes A/B/C), `Docs/Materiality Formula Explanation.txt`, `Docs/survey inputs.docx` (worked example)

## 1. Purpose
Identify which sustainability topics matter most, combining the views of internal stakeholders (employees) and external stakeholders (customers, suppliers, community, investors…, weighted by influence class). The result prioritises issues for action planning (M09) and, in the revamp, supports **ESRS double materiality** (impact + financial) for CSRD reporting.

## 2. Users & permissions
| Role | Can |
|---|---|
| workspace_admin / project lead | Configure assessment, set stakeholder classes, run/validate results, override with justification (`materiality:rate`) |
| contributor | Score IROs (double materiality) when assigned |
| viewer / auditor | Read results, methodology, audit trail |
| stakeholders | Respond via surveys (M08) — no login |

## 3. Current state (legacy)
Two coexisting methods:
1. **Survey-based (live path).** On "Incorporate responses" (`POST /api/surveys/:psId/close`) the server ranks core subjects and issues from completed questionnaires and **overwrites** `materiality.coreSubjects`. Only the top 4 core subjects get an issue breakdown.
2. **Manual rating (orphaned UI, legacy formula).** Drag-and-drop ranking per stakeholder with credits/weights (`materiality/_helper.js`).
Results: core-subject scatter matrix (x = internal relevance, y = external relevance, 0–100, 3×3 grid) and issue matrix for the top-4 core subjects. Known defects: one external respondent without a class → NaN → all external contributions become 0; no internal respondents → results wiped; company self-rating ignored; hard-coded "top 4".

## 4. Scope
### 4.1 Must have (parity)
- **Stakeholder-perception materiality** from surveys (§7.1), recomputed server-side in a transaction when the owner clicks *Calculate results* (can be re-run; each run is a versioned `materiality_result`).
- Stakeholder classes A/B/C per project with the class weights configurable (§7.1 open question).
- Results views: core-subject matrix, issue matrix per core subject (**all 7**, with "top N" as a view filter, default 4), ranked tables, response rates, methodology panel.
- Manual adjustments: admin can override an issue's position with mandatory justification (kept alongside computed values; both shown).
- Validation step (`results_ready → validated`) with sign-off by an admin; validated results feed actions (M09) and reports (M11).

### 4.2 New — **Double materiality (ESRS 1 §3)** (roadmap feature #1)
- **Topic list**: ESRS topical standards and sub-topics (E1–E5, S1–S4, G1) from M16, optionally merged with ISO 26000 issues (mapping in M16) and company-specific topics.
- **IRO register** (Impacts, Risks, Opportunities) per topic: description, type (actual/potential, positive/negative impact; risk; opportunity), value-chain location (own operations / upstream / downstream), time horizon (short/medium/long), affected stakeholders, source evidence (gap answers, survey insights, M17 suggestions).
- **Impact materiality** score per impact: severity = f(scale, scope, irremediability[negative only]), then likelihood for potential impacts (§7.3).
- **Financial materiality** score per risk/opportunity: magnitude × likelihood (§7.3).
- **Thresholds** configurable per project (default: material if score ≥ 3 on a 1–5 scale); topic is material if any of its IROs is material in either dimension.
- **Stakeholder input** integration: survey results (§7.1) displayed per topic as supporting evidence; "affected stakeholder" engagement log.
- **Double materiality matrix** (x = financial, y = impact) + list view; **ESRS disclosure outcome**: material topics → which ESRS standards/datapoints are required (M16), non-material topics require a short justification (E1 climate: detailed explanation if not material).
- Audit trail of every score change; export of the full assessment as an appendix (M11).

### 4.3 Out of scope
- Automated financial quantification (monetary values) — manual entry only.

## 5. User stories & acceptance criteria
- **US-06-1** As an admin I click *Calculate results* after closing surveys; if any external respondent lacks a class, the calculation is blocked with a list of respondents to classify (never silently zeroes them).
- **US-06-2** With zero internal responses the result shows external-only scores and a warning badge "No internal responses — overall = external" (**intentional change**; legacy wiped results).
- **US-06-3** As a sustainability manager I add an IRO "GHG emissions from own fleet" under E1, score scale 4 / scope 3 / irremediability 3 / likelihood actual → impact score 3.33 → material; the matrix updates immediately.
- **US-06-4** As an auditor I open the methodology panel and see thresholds, scales, class weights, the respondents counted and every override with its justification and author.

## 6. Domain model
```ts
materiality_assessments { id, workspace_id, project_id unique, method: 'stakeholder'|'double'|'both', config jsonb
                          { classWeights: {A:1,B:2,C:3}, topN: 4, impactThreshold: 3, financialThreshold: 3, scales… }, state, validated_by?, validated_at? }
materiality_results     { id, workspace_id, assessment_id, version int, computed_at, computed_by, input_summary jsonb
                          { internalRespondents, externalRespondents, excluded[] }, status: 'draft'|'current'|'superseded' }
materiality_scores      { id, workspace_id, result_id, level: 'core_subject'|'issue', ref_id, internal numeric(6,2)?, external numeric(6,2)?,
                          overall numeric(6,2)?, rank int, override_overall numeric?, override_reason?, override_by? }
stakeholder_classes     { id, workspace_id, project_id, stakeholder_id, class: 'A'|'B'|'C', unique(project_id, stakeholder_id) }
-- double materiality
dm_topics  { id, workspace_id, assessment_id, source: 'esrs'|'iso26000'|'custom', ref_code?, title, parent_topic_id?, is_material boolean?, justification? }
iros       { id, workspace_id, topic_id, kind: 'impact'|'risk'|'opportunity', impact_nature?: 'actual'|'potential', impact_sign?: 'positive'|'negative',
             description, value_chain: ('own'|'upstream'|'downstream')[], time_horizon: 'short'|'medium'|'long', stakeholder_groups text[],
             scale smallint?, scope smallint?, irremediability smallint?, likelihood smallint?, magnitude smallint?,
             impact_score numeric(4,2)?, financial_score numeric(4,2)?, is_material boolean, evidence jsonb, owner_user_id? }
```

## 7. Business rules & calculations (engine: `src/modules/materiality/engine/`)

### 7.1 Stakeholder-perception score (legacy parity — `materialityFormula.js`)
Input: completed questionnaires only (M08). Each questionnaire contains one ranking of the 7 core subjects and, per core subject, a ranking of its issues.
1. For a ranking question with `n` items, item at 1-based position `rank`: `inc = round(100 / n, 3)`; `score = round((n + 1 − rank) · inc, 2)`. (Rank 1 ≈ 100; rank 7 of 7 = 14.29.)
2. **External** respondents: `weightedScore = classValue / Σ classValue(all completed external respondents) × score`, `classValue` from the project's class of that stakeholder (default A=1, B=2, C=3).
3. Aggregate per core subject, and per issue within its core subject:
   - `internal = round(Σ score(internal) / N_internal, 2)` (N = completed internal respondents)
   - `external = Σ weightedScore(external)`
   - `overall = (internal + external) / 2`
4. Sort core subjects by `overall` desc; issues within each core subject by `overall` desc; store all (legacy stored issues only for the top 4).
5. Output per node: `internal` (legacy `relevanceCompanyValue`), `external` (legacy `relevanceStakeholdersValue`), `overall` (legacy `weightValue`), 2 dp.
**Intentional changes** (require sign-off): (a) calculation blocked while any external respondent lacks a class; (b) if `N_internal = 0` → `overall = external` (flagged), if no external → `overall = internal` (flagged); (c) issue scores for all core subjects; (d) the company's own ranking (legacy "self" stakeholder, `isCompany`) can be included as an optional internal voice (off by default = legacy behaviour).
Worked example to encode as a test: `Docs/survey inputs.docx` (rank 3 of 7 → 71.43; two class-3 externals → factor 0.5 each).

### 7.2 Legacy manual-rating formula (import only)
Used by old projects rated via the orphaned drag-and-drop UI (`materiality/_helper.js`): `relevance(n, rating) = (100/n)(n − rating + 1)`; total credits 500, stakeholder pool 250, company self stakeholder credits 250 / weight 0.5; other stakeholder `credits_i = 250·x_i/Σx`, `weight_i = credits_i/500`; `stakeholdersValue = Σ rel_i·credits_i/250`; `companyValue = mean(rel·credits/250)` over company entries; `weight = (stakeholdersValue + companyValue)/2`. Not offered for new projects; historical results are imported as-is (read-only).

### 7.3 Double materiality scoring (new; defaults, configurable)
All inputs on 1–5 scales with labelled anchors.
- Negative impact severity `S = mean(scale, scope, irremediability)`; positive impact severity `S = mean(scale, scope)`.
- Actual impact: `impact_score = S`.
- Potential impact: `impact_score = S × likelihood / 5`. ESRS says severity takes precedence over likelihood for potential **human-rights** impacts, so for those `impact_score = max(S × likelihood / 5, S − 1)` (proposed floor — methodology choice to confirm with CSRC).
- Risk/opportunity: `financial_score = magnitude × likelihood / 5` (range 0.2–5).
- IRO material ⇔ `impact_score ≥ impactThreshold` or `financial_score ≥ financialThreshold`; topic material ⇔ any IRO material (or admin override with justification).
- Matrix position of a topic = (max financial score, max impact score) of its IROs.

## 8. API contract (REST `/v1`)
| Route | Permission |
|---|---|
| `GET/PATCH /projects/:id/materiality` (config, state) | `project:read` / `materiality:rate` |
| `GET/PUT /projects/:id/materiality/classes` (bulk stakeholder classes) | `materiality:rate` |
| `POST /projects/:id/materiality/results` (calculate → new version; 409 with blockers) | `materiality:rate` |
| `GET /projects/:id/materiality/results/current` · `GET …/results?version=` | `project:read` |
| `PATCH /projects/:id/materiality/scores/:scoreId/override` `{ overall, reason }` | `materiality:rate` |
| `POST /projects/:id/materiality/validate` | `materiality:rate` (transition, M03) |
| `GET/POST /projects/:id/materiality/topics` · `PATCH/DELETE …/topics/:tid` | `materiality:rate` |
| `GET/POST /projects/:id/materiality/topics/:tid/iros` · `PATCH/DELETE /iros/:iroId` | `materiality:rate` |
| `GET /projects/:id/materiality/matrix?type=stakeholder|double` (chart read model) | `project:read` |

## 9. UI
- `/projects/:id/materiality` tabs: **Overview** (state, response rates, next action) · **Stakeholder results** (matrix + ranked table; core subject selector for issue matrix) · **Double materiality** (topics tree ↔ IRO list; IRO editor in a Sheet with guided scoring sliders and anchor descriptions; live matrix) · **Methodology** (config, respondents, overrides, audit) · **Disclosure outcome** (material ESRS standards, justifications).
- Matrix per design system §6.4: direct labels, quadrant thresholds, shape per core subject, click → drawer with details and evidence; "View as table" always available.

## 10. Events & audit
`materiality.results.computed` (version, counts), `materiality.score.overridden`, `materiality.validated`, `iro.created|updated|deleted`, `topic.materiality.changed`. Notifications: results ready → project lead; validation → members.

## 11. Migration
- `materiality.coreSubjects[]` (+ nested issues) → one `materiality_results` version (status `current`) + `materiality_scores`; `stakeholders[].groupXFactor` → `stakeholder_classes` (1→A, 2→B, 3→C); legacy manual-rating projects flagged `method_legacy = 'manual_credits'`.
- Golden master: recompute from migrated survey responses (M08) and compare with stored `weightValue`s; differences explained by the intentional changes above.

## 12. Test plan
- Engine: worked example; NaN/zero-respondent cases; class weights; ties (stable sort by core-subject order); double-materiality thresholds incl. human-rights floor.
- API: blockers; versioning; overrides audited.
- Visual: matrix label collision on 41 issues; RTL mirroring of axes.

## 13. Open questions
- **Class semantics:** with A=1, B=2, C=3, class C carries the *most* weight. Is C the most influential group, or should A be? (Confirm with CSRC methodology.)
- Keep internal/external 50/50 in `overall`, or make it configurable?
- Double materiality scales and the human-rights rule — adopt EFRAG IG-1 guidance literally or CSRC's own methodology?
