# M16 — Frameworks & Disclosures (ESRS / GRI / ISSB / BRSR / SDG mapping) · NEW

> Status: Draft · Phase: 2 · Depends on: M04 (question library), M06, M09, M13 (content admin)

## 1. Purpose
Today the platform is built around the **ISO 26000** structure only (7 core subjects → 41 issues of interest → ~609 key considerations, see `CSR_BE/Docs/GapAnalysisV2.xlsx`). Customers increasingly have to report against mandatory or investor frameworks. This module adds a **framework layer**: every question, KPI and materiality topic can be tagged to disclosure requirements, so one assessment produces coverage and a disclosure index for several frameworks.

Supported frameworks (initial):

| Framework | Why |
|---|---|
| **ESRS** (EU CSRD) — ESRS 2 + E1–E5, S1–S4, G1 | Mandatory for in-scope EU companies and their value chain; requires double materiality (M06) |
| **GRI Standards 2021** (Universal + Topic standards) | Most widely used voluntary standard |
| **IFRS S1 / S2** (ISSB) | Investor-focused, climate (S2) aligns with M18 |
| **BRSR / BRSR Core** (India, SEBI) | Mandatory for top listed Indian companies |
| **UN SDGs** (17 goals / 169 targets) | Impact storytelling |
| **ISO 26000** | Existing backbone, kept as the default question taxonomy |
| **UN Global Compact** | Legacy "annual review" checklist becomes a real framework (10 principles, CoP-style export) |

## 2. Users & permissions

| Role | Can |
|---|---|
| Platform admin / content editor | Import framework versions, maintain mappings (`framework:manage`) |
| Company admin | Choose applicable frameworks per project (`project:configure`) |
| All project members | See coverage and disclosure index (`project:read`) |

## 3. Scope
### Must have
- Versioned framework catalogue: `Framework → Standard → DisclosureRequirement → Datapoint` (ESRS has ~1,100 datapoints; import from EFRAG's official IG-3 datapoint list / XBRL taxonomy, GRI from its content index). **UN Global Compact** (10 principles) replaces the legacy static annual-review checklist..
- Many-to-many **mappings**: question ↔ datapoint, KPI ↔ datapoint, materiality topic ↔ ESRS topical standard / sub-topic.
- Per project: select frameworks → **coverage dashboard** (datapoints covered / partially / not covered / not material), filter by standard.
- **Disclosure index** export (GRI content index, ESRS index with "material / not material / phased-in" status) as XLSX and as a report section.
- ESRS materiality linkage: topics assessed as not material in M06 mark their datapoints "not material" (with the justification captured in M06).

### New / later
- iXBRL export for ESRS digital tagging (Phase 4; depends on EU filing timelines).
- Framework-specific question packs (e.g. BRSR Section A/B/C questionnaire) shown as additional sections in the gap workspace.

## 4. Domain model
```ts
frameworks          { id, code: 'ESRS'|'GRI'|'ISSB'|'BRSR'|'SDG'|'UNGC'|'ISO26000', version, effective_from date, status: 'draft'|'published'|'retired' }
framework_nodes     { id, framework_id, parent_id?, type: 'standard'|'topic'|'disclosure'|'datapoint'|'principle'|'goal'|'target',
                      code /* 'E1-6', 'GRI 305-1', 'S1-1_01' */, title_key, description_key?,
                      data_type?: 'narrative'|'quantitative'|'semi_narrative'|'boolean'|'date', unit_code?,
                      phase_in jsonb?, voluntary boolean default false, order }
framework_mappings  { id, from_type: 'kc'|'kpi'|'library_kpi'|'dm_topic'|'checklist_item', from_ref, node_id, strength: 'full'|'partial', note? }
project_frameworks  { project_id, workspace_id, framework_id, primary key(project_id, framework_id) }
```
Global (non-tenant) collections for catalogue & mappings; selections are tenant-owned.

## 5. Business rules
- Coverage of a datapoint = `covered` if every mapped source item is answered/has a value for the reporting period, `partial` if some, `missing` otherwise; `not_material` if its topic was assessed not material (ESRS) — except ESRS 2 general disclosures, which are always required.
- Framework versions are immutable once published; projects pin a version; upgrading a project to a new version shows a diff.

## 6. API contract (REST `/v1`)

| Route | Permission |
|---|---|
| `GET /frameworks` · `GET /frameworks/:id/nodes?parentId=&q=` (tree, localised) | authenticated |
| `PUT /projects/:pid/frameworks` `{ frameworkVersionIds }` | `project:configure` |
| `GET /projects/:pid/frameworks/:fid/coverage` (grouped by standard: covered/partial/missing/not material) | `project:read` |
| `GET /projects/:pid/frameworks/:fid/disclosure-index` · `…/disclosure-index.xlsx` | `project:read` / `report:export` |
| `GET/POST/DELETE /platform/framework-mappings` · `POST /platform/frameworks/import` (job) | `framework:manage` (platform) |

## 7. UI
- Project settings → "Frameworks" step in the project wizard (multi-select cards with logos-free text labels).
- Coverage page: sunburst-free design — a table grouped by standard with progress bars and a "Missing" filter; per-row drill-down to mapped questions/KPIs (click → opens the question in the gap workspace).
- Question card shows framework chips (e.g. `ESRS G1-1`, `GRI 205-2`) with tooltip text.
- Admin: mapping editor with search on both sides and bulk CSV import/export.

## 8. Migration
- Seed ISO 26000 framework from the existing question library (core subject/issue/key consideration codes such as `1_1_1`).
- Initial ESRS/GRI mappings authored by the CSR content team (CSV), reviewed, imported via `importFrameworkVersion`.

## 9. Test plan
- Unit: coverage calculation incl. not-material propagation and ESRS 2 exception.
- Integration: version pinning; mapping import idempotency.
- Content QA: every ESRS disclosure requirement has at least one mapping or an explicit "no source yet" flag.

## 10. Open questions
- Which frameworks do current customers need first (ESRS vs BRSR vs GRI)? Drives Phase 2 ordering.
- The organisation also has a `GRI_tracker` repository — reuse its GRI content/mappings?
- Licensing terms for redistributing GRI/ISSB text inside the product (may need links + codes only).
