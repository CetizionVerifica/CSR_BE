# M10 — Supply Chain (supplier network, due diligence & ranking)

> Status: Draft · Phase: 3 · Depends on: M02, M04, M05, M08 (form builder), M12 · Blocks: M11 (ranking report), M18 (supplier emissions)
> Legacy code: BE `schema/mutations/company/{requestSupplier,acceptSupplier,rejectSupplier,removeSupplier,showSupplierResults,requestPartner,acceptPartner,rejectPartner}.js`, `schema/mutations/agency/{suppliers,removePartner}.js`, `mutations/supplierRequest/*`, `controllers/{externalSuppliers,suppliers}.js`, `models/{externalSuppliers,supplierRequest}.js`, `agency.partners[]`, `company.suppliers[]`, `project.supplierProperties[]` · FE `suppliers/*`, `partners/*`, `rankingSystem/**` (ranking + PDF report), `gapAnalysis/SupplierGap.js`

## 1. Purpose
Let a **buyer** company assess and rank its suppliers' CSR performance: invite suppliers to the platform (or record off-platform ones), request access to their verified results, run supplier questionnaires, score risk, rank and screen suppliers, and track corrective actions — the basis for supply-chain due-diligence obligations (CSDDD, German LkSG, etc.).

Terminology fix: legacy uses "Partners" for *customers who listed you as their supplier* and "Suppliers" for the reverse, with badges cross-wired. New terms: **My suppliers** (I am the buyer) and **My customers** (I am the supplier).

## 2. Users & permissions

| Role | Can |
|---|---|
| Buyer workspace_admin / procurement lead | Manage supplier list, invites, requests, questionnaires, risk & ranking (`supplier:manage`, `supplier:rank` needs entitlement `ranking`) |
| Supplier workspace_admin | Accept/decline customer requests, choose what to share per year/project, answer questionnaires |
| viewer | Read |

## 3. Current state (legacy)
- Registered supplier flow: buyer requests a year → supplier accepts by picking its project for that year → buyer sees supplier results (if `fullAccessToResults`); partner (reciprocal) requests per project; physical-audit flag; results visibility toggles.
- Unregistered supplier: email invite; converted only if the invitee later joins via `addUserToOrganisation`.
- Off-platform "Other suppliers" register: category, coverage, engagement status, contact, assessment method/result, compliance (`Pending/Compliant/Noncompliant`), high-concern flag. No delete.
- **Ranking is computed only in the browser** (filters: year, region, country, sector, impact; screening level overall/core subject/issue with % range; tables: Ranking, Conforming, Non-conforming, High concern; yearly trend lines; PDF report via jsPDF). Bugs: the impact filter never matches (condition always true); issue-level screening checks the wrong variable.
- Consent disclaimer before sharing; notifications by email only on assessment completion.

## 4. Scope
### 4.1 Must have (parity + fixes)
- **Supplier record** (buyer side, one table for all): name, country, sector, category (goods/services taxonomy), criticality (low/medium/high), annual spend band (optional), contact, tags, `platform_status: 'linked' | 'invited' | 'off_platform'`, compliance status, high-concern flag + reason, notes, documents (certificates with expiry).
- **Invite** (by email) → invitee signs up (creates or joins a workspace) → link established automatically (fixes legacy dead-end).
- **Access requests & sharing**: buyer requests results for reporting year(s); supplier accepts and selects the project; supplier chooses sharing level: `status_only` (completion + verified overall score) or `full_results` (core subject/issue scores + documentation assessment summary); can revoke anytime; every access audited (M12). Physical audit flag per link/year.
- **Supplier results view** (read-only gap results — replaces `SupplierGap`), clearly labelled self-assessed vs verified.
- **Ranking & screening engine (server-side, §7)** with the legacy filters + fixed impact dimension, tables (Ranking, Conforming, Non-conforming, High concern), yearly trend, CSV/XLSX export and a server-rendered PDF report (M11).
- "My customers" view for suppliers: requests, what is shared with whom, revoke.

### 4.2 New (roadmap feature #10)
- **Supplier questionnaires (SAQ)** built with the M08 form builder (e.g. code of conduct acknowledgement, human-rights due diligence, environmental permits), sent to linked *and* off-platform suppliers via token links; scoring rules per question.
- **Risk scoring**: inherent risk from country (e.g. ITUC/WJP/CPI-style indices, licensed reference data) × sector risk × criticality; residual risk after questionnaire/assessment results; heat map.
- **Corrective action plans (CAP)** for non-conforming suppliers: findings, required actions, due dates, supplier responses, verification (shares the M09 action model with `origin='supplier'`).
- Certificate expiry tracking with reminders; supplier emissions data request (M18).

## 5. User stories & acceptance criteria
- **US-10-1** I invite `supplier@x.com`; they sign up; the link appears as "linked – awaiting sharing" without manual steps.
- **US-10-2** As a supplier I share `status_only` for 2026 with Customer A and `full_results` with Customer B; each customer sees exactly that.
- **US-10-3** Ranking with filter *impact = high* returns high-criticality suppliers (legacy never matched); screening at issue level uses issue scores.
- **US-10-4** I export the ranking to XLSX and a branded PDF identical in numbers to the screen.

## 6. Domain model
```ts
suppliers        { id, workspace_id (buyer), buyer_company_id, name, country?, sector_code?, category?, criticality?, spend_band?,
                   platform_status, supplier_workspace_id?, supplier_company_id?, invite_email?, invite_token_hash?, invited_at?,
                   compliance: 'pending'|'compliant'|'non_compliant'|'not_assessed', high_concern boolean, high_concern_reason?,
                   contact jsonb?, tags text[], legacy_ref?, created_at, updated_at }
supplier_access  { id, supplier_id, buyer_workspace_id, supplier_workspace_id, reporting_year, supplier_project_id?,
                   status: 'requested'|'granted'|'declined'|'revoked', level: 'status_only'|'full_results', physical_audit boolean,
                   requested_by, decided_by?, decided_at? }          -- readable by both workspaces (RLS policy on either id)
supplier_documents { id, workspace_id, supplier_id, type, file_id, valid_until? }
supplier_risk    { id, workspace_id, supplier_id, inherent numeric, residual numeric?, factors jsonb, computed_at }
cap_findings     { id, workspace_id, supplier_id, title, severity, action_id → actions (M09), status }
```

## 7. Business rules — ranking engine (`src/modules/supply-chain/engine/`)
- **Supplier score** for year Y at level L (overall / core subject / issue): verified value (M05 `overall_revised` or revised scores per node) when `level = full_results` and round completed; otherwise self-assessed value with badge; `status_only` exposes overall only.
- **Tier**: A ≥ 75, B 50–74.9, C 25–49.9, D < 25 (configurable per buyer).
- **Conforming** ⇔ score at the selected screening level within the selected % range (legacy slider) — at issue level, all selected issues must satisfy the range.
- **Impact** (fix of the legacy tertile bug): buyer-defined criticality; where spend band is available, tertiles by spend (low/medium/high) — documented formula, same in UI and export.
- **High concern** list = `high_concern = true` OR non-conforming with criticality high OR compliance `non_compliant`.
- Trend: yearly average of scores of suppliers with data in each year (performance and relevance lines, legacy parity).
- Visibility: a buyer never sees supplier data without a `granted` access row for that year; revocation hides historical detail but keeps the buyer's own records (name, notes).

## 8. API contract (REST `/v1`)

| Route | Permission |
|---|---|
| `GET/POST /companies/:cid/suppliers` · `GET/PATCH/DELETE /suppliers/:id` · `POST /suppliers:import` | `supplier:manage` |
| `POST /suppliers/:id/invite` · `POST /suppliers/:id/access-requests` `{ years }` | `supplier:manage` |
| `GET /customers/requests` · `POST /customers/requests/:id/grant` `{ projectId, level, physicalAudit }` · `…/decline` · `…/revoke` | supplier side `supplier:manage` |
| `GET /suppliers/:id/results?year=` | `supplier:manage` + granted access |
| `GET /companies/:cid/supplier-ranking?year=&level=&range=&region=&country=&sector=&impact=` · `…/export.xlsx` · `POST …/report` (PDF job) | `supplier:rank` + entitlement `ranking` |
| `GET/POST /suppliers/:id/documents` · `GET/POST /suppliers/:id/findings` · SAQ via M08 routes with `purpose='supplier_saq'` | `supplier:manage` |

## 9. UI
- `/suppliers` (buyer): tabs All · Linked · Invited · Off-platform · High concern; filters; bulk import; supplier drawer with profile, access status per year, results summary, documents, findings.
- `/suppliers/ranking`: filter bar in one row (year, level, range slider, region, country, sector, impact), stat tiles (suppliers assessed, % conforming, high concern), ranked bar chart + table with tier badges, trend chart, Export ▾ (XLSX, PDF).
- `/customers` (supplier side): incoming requests with a clear consent dialog explaining what will be shared, sharing matrix (customers × years), revoke.

## 10. Events & notifications
`supplier.invited|linked`, `supplier_access.requested|granted|declined|revoked` (email + in-app to the other party), `supplier.assessment.completed` (legacy "ready for supplier ranking" email), `supplier_document.expiring` (30/7 days), `cap.overdue`.

## 11. Migration
`company.suppliers[] {agency, projects[]}` + `agency.partners[] {company, sharedProjects, showProjectResults, requestedYears, partnerRequestedProjects}` → `suppliers(platform_status='linked')` + `supplier_access` rows per year/project (`showProjectResults`/`fullAccessToResults` → level); `supplierRequest` → `suppliers(platform_status='invited')`; `externalSupplier` → `suppliers(platform_status='off_platform')` (fields mapped to category, compliance, high_concern, notes); `project.supplierProperties.physicalAudit` → `supplier_access.physical_audit`.

## 12. Test plan
Ranking engine table tests (tiers, ranges, levels, impact tertiles, missing data), cross-workspace visibility tests (RLS policies for `supplier_access` from both sides), revoke semantics, PDF/XLSX parity with API numbers.

## 13. Open questions
- The organisation also has `SAQ-BE`/`SAQ-FE` repositories — should supplier questionnaires reuse that product or be rebuilt here?
- Licensed country/sector risk indices: which source (cost, licence terms)?
- Tier thresholds and conformity range defaults per buyer or global?
