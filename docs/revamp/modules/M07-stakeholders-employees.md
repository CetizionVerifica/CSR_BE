# M07 — Stakeholders & Employees (people directory)

> Status: Draft · Phase: 2 · Depends on: M02 · Blocks: M06, M08
> Legacy code: BE `server/models/{stakeholder,employee}.js`, `schema/mutations/company/addEmployee(s).js`, `addStakeholder(s).js`, `schema/mutations/{employee,stakeholder}/*`, `queries/stakeholder/surveyStakeholders.js` · FE `stackholders/*`, `employees/*`, `utility/CsvParrse.js`, `src/images/{employee,stakeholders}.csv`

## 1. Purpose
Maintain the company's directory of **internal stakeholders** (employees) and **external stakeholders** (customers, suppliers, investors, NGOs, community, regulators…) who are invited to materiality surveys (M08), weighted by class (M06), and referenced in the IRO register and engagement log.

## 2. Users & permissions

| Role | Can |
|---|---|
| workspace_admin / lead | CRUD, import, export, merge duplicates, anonymise (`stakeholder:manage`) |
| contributor / viewer | Read (contact details masked for viewer unless permitted) |

## 3. Current state (legacy)
- Two separate models (employee, stakeholder) with near-identical fields; a hidden "self" stakeholder (`isCompany: true`) per company.
- CSV import parsed in the browser (papaparse), validated only client-side; **the employee template's column order doesn't match the parser → phone and email get swapped**; bulk insert has a lost-update race on `company.employees`.
- `remove` broken (Mongoose 8); soft delete via `active`; search/sort mixed server/client; routes `/company/employees`, `/company/stackholders` orphaned (rendered inside the company page instead).
- No groups/categories beyond external "class", no consent tracking, no GDPR tooling.

## 4. Scope
### 4.1 Must have
- One **`people`** model with `kind: 'internal' | 'external'`; fields: name, email (unique per company+kind, case-insensitive), phone, job title, department (internal), organisation name (external), **stakeholder group** (reference list: employees, management, customers, suppliers, investors/shareholders, lenders, NGOs/civil society, local community, government/regulators, media, trade unions, other) + custom groups, country, language (for survey emails), tags, active.
- Default class per external person (A/B/C) that pre-fills project classes (M06).
- **Server-side CSV/XLSX import** (async job): column mapping step with auto-detection (handles legacy templates), preview of first 20 rows, validation (email format, duplicates in file and against DB), result report (created / updated / skipped with reasons), idempotent re-run. Downloadable templates per kind.
- Export CSV/XLSX; bulk actions (activate/deactivate, change group, change class, delete).
- Duplicate detection & merge (same email or name+organisation).
- Consent & privacy: consent basis (legitimate interest / consent), consent date, "do not contact" flag honoured by M08; **anonymise** a person (keeps aggregated survey results, removes PII) and **export personal data** on request.
- Engagement log (optional per person or group): date, channel, summary, related topics (feeds double materiality evidence).

### 4.2 New
- HRIS sync connector (CSV drop/SFTP or API) for employee lists — Phase 4.

## 5. User stories & acceptance criteria
- **US-07-1** I import 1,200 employees from an XLSX with columns in any order; the mapping step suggests matches; the job finishes < 30 s; the report lists 3 invalid emails and 12 duplicates with row numbers.
- **US-07-2** I mark an external stakeholder "do not contact"; they are excluded from survey sends with a visible reason.
- **US-07-3** On a GDPR erasure request I anonymise a person; their past survey answers remain in aggregates but their name/email disappear everywhere, and the action is audited.

## 6. Domain model
```ts
people { id, workspace_id, company_id, kind: 'internal'|'external', first_name, last_name?, email citext?, phone?, job_title?, department?,
         organisation?, group_key → stakeholder_groups, default_class?: 'A'|'B'|'C', country?, language?, tags text[],
         consent_basis?, consent_at?, do_not_contact boolean default false, active boolean default true,
         anonymised_at?, legacy_id?, created_at, updated_at,
         unique(company_id, kind, lower(email)) where email is not null and anonymised_at is null }
stakeholder_groups { key pk, workspace_id? (null = global default), kind, label_key/label }
engagements { id, workspace_id, company_id, person_id?, group_key?, date, channel, summary, topic_refs text[], created_by }
import_jobs { id, workspace_id, type: 'people'|'gap_answers'|'kpi_values'|'activity_data', file_id, mapping jsonb, status, report jsonb, created_by, created_at }
```

## 7. Business rules
- Email optional for people who are never surveyed; required to be invited.
- Deleting a person with survey responses → soft delete (hidden, responses kept); hard delete only via anonymise.
- The legacy "self" stakeholder becomes the optional "company voice" setting in M06, not a person.

## 8. API contract (REST `/v1`)

| Route | Permission |
|---|---|
| `GET /companies/:cid/people?filter[kind]=&filter[group]=&q=&cursor=` | `project:read` |
| `POST /companies/:cid/people` · `PATCH/DELETE /people/:id` · `POST /people:bulk` | `stakeholder:manage` |
| `POST /companies/:cid/people/imports` (file id + kind) → job · `PATCH /imports/:jobId` (mapping) · `POST /imports/:jobId/run` · `GET /imports/:jobId` | `stakeholder:manage` |
| `GET /companies/:cid/people/export.xlsx` | `report:export` |
| `POST /people/:id/anonymise` · `GET /people/:id/personal-data` | `stakeholder:manage` |
| `GET/POST /companies/:cid/engagements` | `stakeholder:manage` |

## 9. UI
- `/companies/:cid/people` with tabs Internal · External · Groups · Engagement; DataTable with group chips, class badge, consent icon; "Import" opens a 3-step wizard (Upload → Map columns → Review & run) with a live results report.

## 10. Events & audit
`person.created|updated|deleted|anonymised|merged`, `people.imported` (counts). Anonymise & export are always audited.

## 11. Migration
`employees` → `people(kind='internal')`; `stakeholders` (excluding `isCompany`) → `people(kind='external')`, `companyName` → `organisation`; per-project `groupXFactor` → M06 `stakeholder_classes`; set `default_class` from the most recent project.

## 12. Test plan
Import edge cases (BOM, semicolon CSV, Excel dates, duplicate emails with different case, legacy column orders), uniqueness under concurrency, anonymisation completeness (no PII left in people, survey recipients, audit payloads).
