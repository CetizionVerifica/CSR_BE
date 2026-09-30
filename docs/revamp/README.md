# ResiliSense 2.0 — Revamp Spec Pack

This folder is the **single source of truth** for rebuilding ResiliSense from scratch. It is mirrored **identically** in both repositories:

- `CetizionVerifica/CSR_BE` → new API (NestJS + PostgreSQL)
- `CetizionVerifica/Resilisense-FE` → new web app (Vite + React + Tailwind/shadcn)

> **Keep the two copies in sync.** Any change to `docs/revamp/**` must be made in both repos in the same working day (same commit message). CI can enforce this later with a checksum job.

## Reading order

| # | Document | What it answers |
|---|---|---|
| 00 | [Current-state review](00-current-state-review.md) | What the legacy product does, what is broken/insecure, what we keep |
| 01 | [Target architecture & ADRs](01-target-architecture.md) | Stack, repo layout, API style, auth, tenancy, VPS hosting (no AWS), delivery, NFRs |
| 02 | [Design system](02-design-system.md) | Brand tokens, components, layouts, charts, accessibility |
| 03 | [Roadmap & new features](03-roadmap-and-new-features.md) | Phases, prioritised feature backlog, success metrics, risks |
| 04 | [Data migration & cut-over](04-data-migration.md) | Mongo → Postgres ETL, validation, runbook |

## Module specs (`modules/`)

| ID | Module | Phase | Type |
|---|---|---|---|
| [M01](modules/M01-identity-access.md) | Identity & access (auth, users, roles, memberships) | 1 | rebuild + fixes |
| [M02](modules/M02-workspaces-companies.md) | Workspaces, companies, entitlements, partners | 1 | rebuild |
| [M03](modules/M03-projects.md) | Projects & project journey (state machines) | 2 | rebuild |
| [M04](modules/M04-gap-analysis.md) | Gap analysis (ISO 26000 self-assessment, scoring engine) | 2 | rebuild |
| [M05](modules/M05-documentation-assessment.md) | Documentation assessment (platform assessor review) | 2 | rebuild |
| [M06](modules/M06-materiality.md) | Materiality (stakeholder-based + **double materiality**) | 2 | rebuild + new |
| [M07](modules/M07-stakeholders-employees.md) | Stakeholders & employees directory | 2 | rebuild |
| [M08](modules/M08-surveys.md) | Surveys & public respondent app | 2 | rebuild |
| [M09](modules/M09-actions-kpis.md) | Actions, KPIs & targets | 3 | rebuild + new |
| [M10](modules/M10-supply-chain.md) | Supply chain, due diligence & ranking | 3 | rebuild + new |
| [M11](modules/M11-reporting-dashboards.md) | Reporting, dashboards & exports | 2–3 | rebuild + new |
| [M12](modules/M12-notifications-collaboration-audit.md) | Notifications, collaboration & audit trail | 1–2 | new |
| [M13](modules/M13-platform-admin-content.md) | Platform admin & content library | 1–3 | rebuild + new |
| [M14](modules/M14-files-evidence.md) | Files & evidence | 1 | rebuild |
| [M15](modules/M15-localization.md) | Localisation & RTL | 1–2 | rebuild |
| [M16](modules/M16-frameworks-disclosures.md) | Frameworks & disclosures (ESRS, GRI, ISSB, BRSR, SDG, UNGC) | 2 | **new** |
| [M17](modules/M17-ai-assistant.md) | AI assistant (Claude) | 3 | **new** |
| [M18](modules/M18-carbon-ghg.md) | Carbon & GHG accounting | 3 | **new** |

New specs start from [`modules/_TEMPLATE.md`](modules/_TEMPLATE.md).

## How to use this pack (humans and Claude Code)

1. **Before building a module**, read its spec end-to-end plus `01` (conventions) and `02` (UI). If the spec is ambiguous, resolve it in the spec first (PR to `docs/revamp`), then code.
2. **Status line**: each spec starts with `Status: Draft | Ready | In progress | Shipped`. Only `Ready` specs should be implemented; move to `In progress` in the first implementation PR and `Shipped` when released.
3. **Intentional changes** vs legacy behaviour are marked in the specs. Anything else that changes a legacy calculation is a bug unless the spec is updated.
4. **Open questions** at the end of each spec need an owner decision; record the answer in the spec (don't leave decisions only in chat or tickets).
5. **Decisions log**: ADR status changes go in `01-target-architecture.md` with the date.

## Decisions needed before Phase 1

| # | Decision | Recommendation | Where |
|---|---|---|---|
| 0 | Hosting — **decided: self-managed VPS, no AWS** | Pick the VPS provider per region (EU + India), S3-compatible object storage and off-site backup provider; deploy with Kamal 2, provision with Ansible, Cloudflare in front | ADR-011 |
| 1 | Database | PostgreSQL 16 + Prisma (alternative: stay on MongoDB) | ADR-003 |
| 2 | API style | REST + OpenAPI (legacy was GraphQL) | ADR-004 |
| 3 | Repos | Keep 2 repos; legacy on `legacy` branch; `main` reset for new code after deploys re-pointed | ADR-001, ADR-009 |
| 4 | Launch languages | en + confirmed list (ar/de/fr/ro candidates; Greek for surveys?) | M15 |
| 5 | Stakeholder class weights (A=1/B=2/C=3 gives C the most weight) | Confirm with CSRC methodology | M06 |
| 6 | Relationship to sibling products (`SAQ-*`, `Carbon-Lens-*`, `GRI_tracker`) | Decide reuse vs rebuild before M10/M16/M18 | M10, M16, M18 |
