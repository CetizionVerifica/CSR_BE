# 03 — Roadmap & New Features

> Status: **Proposed**. Durations assume a team of 2 BE + 2 FE engineers + 1 designer + part-time QA, with Claude Code doing a large share of implementation against these specs. Re-estimate after Phase 1.

## 1. Phases (greenfield rebuild)

The owner decided to **start the code from scratch** (ADR-001). The legacy system keeps serving customers until cut-over, so Phase 0 hardens it while the new system is built in parallel.

### Phase 0 — Secure the live legacy system & prepare (2–3 weeks, on branch `legacy`)
- Create `legacy` branch + `legacy-v1` tag in both repos; **re-point all production deploy pipelines to `legacy`** before `main` is reset for the new code.
- Apply the Phase 0 security checklist in `00-current-state-review.md` §2 (credential rotation, auth on `/api/users*`, password-reset rebuild, remove password-write paths, JWT expiry, GraphiQL off, rate limits, log redaction, static FE build without public source maps).
- Take an anonymised production snapshot → golden-master fixtures and ETL development data.
- Confirm the open decisions: VPS provider per region (ADR-011 — self-managed VPS, **no AWS**), object-storage and off-site backup providers, database (ADR-003), launch languages, stakeholder-class semantics, scoring edge cases (see `00-current-state-review.md` §6).

### Phase 1 — Foundations (6–8 weeks)
- **BE**: NestJS scaffold, config/logging/errors, Prisma + PostgreSQL + RLS, OpenAPI pipeline, BullMQ worker, Docker/compose, VPS infrastructure as code (Ansible provisioning & hardening of `staging`, `app-1`, `data-1`; PostgreSQL + pgBackRest off-site backups with a first restore drill; Valkey; object storage; Cloudflare DNS/WAF; Postmark; Sentry; monitoring & alerts; runbooks) and CI/CD with Kamal 2 to staging; **M01** identity & access, **M02** workspaces/companies/entitlements, **M14** files, **M12** audit + email core, **M13** platform admin (workspaces/users) + reference-data seeding (taxonomy, 609 KCs, templates), **M15** i18n framework.
- **FE**: Vite + React + TS scaffold, design system in Storybook (`02-design-system.md`), app shell (sidebar, top bar, workspace switcher, command palette, notification bell), auth screens, settings pages, generated API client, i18n + RTL + dark mode, Playwright/axe CI.
- ETL skeleton for users/workspaces/companies (DR0 on anonymised data).

### Phase 2 — Core assessment product (10–12 weeks) → **pilot**
- **M03** projects & journey, **M04** gap analysis workspace, **M05** documentation assessment, **M07** people directory, **M08** surveys (new public survey app), **M06** materiality (stakeholder method + double materiality), **M16** frameworks (ESRS/GRI mapping, coverage), **M11** dashboards + Gap/Materiality/Doc-assessment PDF reports, **M12** notification centre, comments, inbox.
- ETL DR1/DR2 with golden-master sign-off; pilot with 2–3 customers.

### Phase 3 — Performance, supply chain & intelligence (8–10 weeks) → **cut-over**
- Infra: PostgreSQL streaming replica (`data-2`) + fail-over runbook tested, second app node if load requires, load test on production-sized VPSs.
- **M09** actions/KPIs/targets, **M10** supply chain (links, sharing, ranking, SAQ, risk), **M17** AI assistant, **M18** carbon MVP, **M13** content editor & help centre, SSO/MFA enforcement.
- ETL DR3 → cut-over (see `04-data-migration.md` §6); legacy read-only for 90 days, then decommissioned together with **all legacy AWS resources** (EC2, S3, CloudFront).

### Phase 4 — Scale & differentiation (ongoing)
Benchmarking, integrations & public API, billing, iXBRL, report builder v2, PWA/offline, HRIS/ERP connectors, custom question packs.

## 2. New features — prioritised backlog

Scoring: **Impact** (customer value / revenue), **Effort** (S ≤ 2 wks, M ≤ 6 wks, L > 6 wks), **Priority** P1 (plan for launch) · P2 (next) · P3 (later).

| # | Feature | What it is | Why it matters | Impact | Effort | Priority | Spec |
|---|---|---|---|---|---|---|---|
| 1 | **Double materiality (ESRS)** | Upgrade materiality to impact materiality (scale, scope, irremediability, likelihood) + financial materiality (magnitude, likelihood) with an IRO register (Impacts, Risks, Opportunities) across the value chain | Mandatory under CSRD; biggest gap vs competitors | High | M | P1 | M06 |
| 2 | **Framework mapping & disclosure index** | Tag questions/KPIs to ESRS, GRI, ISSB, BRSR, SDGs; coverage dashboard; content index export | One assessment → many reports; sells to regulated customers | High | M | P1 | M16 |
| 3 | **Collaboration & workflow** | Assign questions/sections to people, due dates, comments with @mentions, review/approve steps, reminders, activity feed | Assessments involve 5–30 people; today it is one person filling forms | High | M | P1 | M12, M04 |
| 4 | **Audit trail & assurance readiness** | Immutable history of every answer/score/value change, evidence locking at submission, read-only *Auditor* role, sign-off | CSRD requires limited assurance; auditors need the trail | High | S–M | P1 | M12, M01 |
| 5 | **Report builder & branded exports** | Server-rendered PDF/DOCX/PPTX reports with the client's logo, cover, ToC, charts, methodology; scheduled report packs | Replaces fragile html2canvas PDFs; reports are the product's output | High | M | P1 | M11 |
| 6 | **Modern public survey experience** | Mobile-first, multilingual, save & resume, anonymous links, QR codes, reminders, response-rate tracking, consent capture | Survey response rates drive materiality quality | High | M | P1 | M08 |
| 7 | **Notification centre** | In-app + email (+ Teams/Slack webhooks) notifications with user preferences and weekly digest | Keeps multi-stakeholder projects moving | Med | S | P1 | M12 |
| 8 | **AI Copilot** | Evidence analyser with citations, bulk pre-assessment, survey insights, narrative drafting, action suggestions | Cuts assessment effort by days per project; strong differentiator | High | M–L | P2 | M17 |
| 9 | **Carbon & GHG accounting** | Scope 1/2/3 inventory, factor library, targets, intensity metrics | Most requested disclosure (ESRS E1, IFRS S2, BRSR) | High | L | P2 | M18 |
| 10 | **Supplier portal & due diligence** | Supplier invites, self-assessment questionnaires, country/sector risk scoring, corrective action plans, certificate expiry tracking | CSDDD / supply-chain laws; extends existing supplier ranking | High | L | P2 | M10 |
| 11 | **KPI data hub & targets** | Metric library with units/periods/owners, data requests to contributors, approval, targets with progress and SDG alignment | Turns one-off assessments into continuous performance management | High | M | P2 | M09 |
| 12 | **ESG risk register & climate scenarios** | Risks/opportunities with likelihood × impact heat map, owners, mitigations; TCFD/IFRS S2 physical & transition scenario notes | Links materiality to enterprise risk management | Med | M | P2 | M06 ext. |
| 13 | **Executive dashboard & YoY comparison** | Portfolio view for agencies (all clients) and year-over-year comparison for companies | Upsell to consultants; shows progress | Med | S | P2 | M11 |
| 14 | **Multi-entity / group consolidation** | Parent–subsidiary hierarchy, roll-up of scores/KPIs, entity-level permissions | Needed for groups and CSRD consolidated reporting | Med | M | P2 | M02 |
| 15 | **SSO & MFA** | OIDC (Microsoft Entra ID, Google), TOTP MFA, enforced per org | Enterprise sales requirement | Med | S | P2 | M01 |
| 16 | **Benchmarking** | Anonymised, opt-in peer comparison by sector/size/country | Network effect, data product | Med | M | P3 | M11 |
| 17 | **Integrations & public API** | Personal access tokens / OAuth apps, webhooks, CSV/XLSX importers, HRIS/ERP connectors, Microsoft 365 (Teams notifications, SharePoint evidence picker) | Reduces manual data entry | Med | M | P3 | M13 |
| 18 | **Billing & plans** | Stripe subscriptions, seat/project limits, trial, invoices; replaces ad-hoc license flags | Self-serve growth | Med | M | P3 | M02 |
| 19 | **Guided onboarding & help centre** | Setup checklist, product tours, contextual help from the handbook (replaces the PDF handbook), in-app changelog | Fewer support tickets | Med | S | P2 | M13 |
| 20 | **Digital tagging (iXBRL)** | ESRS XBRL taxonomy tagging of the sustainability statement | Future filing requirement | Med | L | P3 | M16 |
| 21 | **GDPR & privacy tooling** | Data export/deletion per org and per respondent, retention policies, consent log | Legal requirement; trust | Med | S | P1 | M12, M08 |
| 22 | **Offline-capable PWA for surveys/field audits** | Complete questionnaires offline (factories, remote sites) and sync later | Supplier & site audits in low-connectivity areas | Low | M | P3 | M08 |

### Suggested launch bundle ("ResiliSense 2.0")
Parity modules + features **1, 2, 3, 4, 5, 6, 7, 21** — this makes the product credible for CSRD/BRSR-driven buyers. Features **8–11** form the "2.1" release and are the main differentiators.

## 3. Success metrics

| Metric | Baseline (measure in Phase 0) | Target 6 months after 2.0 |
|---|---|---|
| Time to complete a gap analysis (median, days) | ? | −40 % |
| Survey response rate | ? | +25 % |
| Projects reaching "report generated" | ? | +30 % |
| Support tickets per active org / month | ? | −50 % |
| Lighthouse performance / accessibility (FE) | ? | ≥ 90 / ≥ 95 |
| p95 API latency | ? | < 300 ms |
| Critical/high security findings open | ? | 0 |

## 4. Risks

| Risk | Mitigation |
|---|---|
| Calculation drift between legacy and new engines changes customers' historical scores | Golden-master fixtures; "intentional change" log; keep legacy results for closed projects |
| Rebuild takes longer than planned while legacy stays exposed | Phase 0 hardening first; strict scope per phase; pilot before full cut-over |
| Data migration surprises (orphans, plaintext passwords, invalid enums) | Rules decided up-front (`04-data-migration.md` §3); three dry runs |
| Customers must re-learn the product | Pilot customers, in-app onboarding tours, help centre, short "what's new" videos; same terminology where it made sense |
| Regulatory scope changes (e.g. CSRD simplification "Omnibus" proposals) | Framework layer is data-driven and versioned (M16); avoid hard-coding ESRS logic in UI |
| AI suggestions trusted blindly | Human acceptance required; citations mandatory; AI output visually distinct; eval gate before launch (M17) |
| Scope creep | Each module spec has explicit Must/Later/Out-of-scope; P3 items stay out of 2.0 |
