# 06 — Modular build: layered CLAUDE.md, module contracts and the due diligence module catalogue

> Status: **Accepted** (owner, 2026-10-09) · Applies to: both repos · Mirrored identically in `CSR_BE` and `Resilisense-FE`

This document turns the plan into units that can be specified, built, reviewed and shipped **one at a time and in parallel**. It adds three things to the spec pack:

1. **Layered `CLAUDE.md` files** from the repo root down to each module folder, so whoever works in a folder (a person or a Claude Code session) reads the rules for exactly that level and nothing contradicts the level above (§2).
2. **Module contracts and coupling rules**, enforced by lint, so a module depends on another only through a small, written public surface (§3–§4).
3. **The supplier due diligence (DD) module catalogue**: the plan items SD01–SD16 mapped to module folders, their contracts and the waves in which they can be built side by side (§5–§6).

It sits on top of the other documents: specs in `modules/` remain the source of truth for behaviour, `01` for architecture, `02` for UI (the chosen visual direction is "Calm Ledger", `02` §9). Decisions behind it: build the due diligence product on this platform first (owner, 2026-10-04) and the Calm Ledger visual direction (owner, 2026-10-09).

---

## 1. Principles

- **One module = one folder per repo = one spec = one PR at a time.** A module owns its tables, routes, permissions, events, i18n namespace and screens. Nobody else writes them.
- **Contracts before code.** A module's public surface (what others may call, the events it emits, the events it listens to) is written in its spec (§14 of the template) and in its `CLAUDE.md` before implementation starts.
- **Depend on contracts, never on internals.** Another module is reached through its `index.ts`, the HTTP API (frontend) or a domain event. Lint fails otherwise (§3.3).
- **Build in isolation.** A module's tests run with the modules it depends on replaced by contract fakes (backend) or MSW handlers (frontend), so it can be built before its dependencies are finished (§4).
- **Composition happens in one place.** `src/app.module.ts` / `src/worker.ts` (backend) and `src/app/router.tsx` / `src/app/shell/nav.ts` (frontend) are the only files that know every module. Adding a module touches each of them with one line or entry.

## 2. The CLAUDE.md layers

Claude Code reads the root `CLAUDE.md` at session start and the `CLAUDE.md` of a folder when it works on files inside it, so rules placed in a folder apply exactly where they are needed. Each layer **adds detail and never contradicts** the one above; when a lower file disagrees with the spec, the spec wins and the file is fixed in the same PR.

| Level | Where | Says | Changes when |
| --- | --- | --- | --- |
| 0 · Repo | `CLAUDE.md` | Product, stack, commands, global rules, links to the layers below | Stack or global rule changes |
| 1 · Layer | Backend: `src/modules/`, `src/common/`, `src/infra/`, `prisma/`, `test/` · Frontend: `src/features/`, `src/app/`, `src/components/ui/`, `src/components/charts/`, `src/lib/`, `src/mocks/`, `e2e/` | What belongs in this layer, its file anatomy, what it may import, how it is tested | A convention changes (playbook §5: corrected twice → write it down) |
| 2 · Module | `src/modules/<module>/CLAUDE.md`, `src/features/<module>/CLAUDE.md` | The module card (§2.1): spec link, contract, components and their behaviour, invariants, tests | Every PR that changes the module |
| 3 · Part (optional) | e.g. `src/modules/<module>/engine/CLAUDE.md`, `src/features/<module>/components/CLAUDE.md` | Formulas, edge cases, component state tables too long for the module card | A module grows past ~150 lines of card |

Rules for every `CLAUDE.md`:

- Short and imperative. Link to spec sections (`M10 §7`) instead of copying them; copy only what a builder needs at hand (permission strings, event names, folder anatomy).
- Name real files and symbols. A card that names something that no longer exists is a bug; `/check-module` reports it.
- No secrets, no personal data, no customer names.

### 2.1 The module card (level 2)

Every module folder has a `CLAUDE.md` with these headings, in this order. `/module-contract` writes it; `/build-module` keeps it current.

```md
# <Module name> (<spec id> · <plan id>)
> Spec: docs/revamp/modules/<file>.md · Status: Draft | Ready | In progress | Shipped · Wave: n

## Purpose            one paragraph, who uses it and for what
## Owns               tables / routes or screens / permissions / events / i18n namespace / query keys
## Public surface     what index.ts exports and why (each export one line); HTTP routes others' UIs may call
## Depends on         other modules' public surfaces it uses, and the contract fake used in tests
## Events             emits (name → payload) · consumes (name → reaction)
## Components & behaviour   per component or service: responsibility, states, rules, keyboard/a11y, motion
## Invariants         what must always hold (tenancy, state machine, engine ranges)
## Tests              where the tests live, which stories (US-xx-y) they prove
## Not here           what belongs to other modules, so nobody adds it here
```

## 3. Module contracts and coupling rules

### 3.1 Public surface

- **Backend**: `src/modules/<module>/index.ts` exports the Nest module plus, deliberately, the services, read-model types, event-name constants and pure helpers other modules may use. Everything else is private.
- **Frontend**: `src/features/<module>/index.ts` exports route objects and the few components or schemas another feature composes (for example the company form reused by partner onboarding). Pages, hooks and internal components stay private.
- A public export is a promise: renaming or removing one is a breaking change for the module's consumers and is called out in the PR.

### 3.2 How modules may talk

| Need | Backend | Frontend |
| --- | --- | --- |
| Read another module's data | Call a query method its `index.ts` exports (returns a read-model type, never a Prisma row) | Call the generated API hook for that module's endpoint; never import its hooks |
| React to something that happened | Consume its domain event (name constant from its `index.ts`); side effects run in BullMQ workers (01, CLAUDE.md) | Invalidate the generated query keys after a mutation |
| Reference its records | Store the id (`uuid`). Foreign keys only to kernel tables: `workspaces`, `companies`, `users`, `files`, reference data | Link to its route by path |
| Show its UI inside yours | — | Mount a component its `index.ts` exports, or link to its route |

Never: import another module's repository, entity or `dto/` internals; join another module's tables in a query; write another module's tables; share mutable state through `src/common`.

**Kernel.** `src/common`, `src/infra`, `src/config` (backend) and `src/components`, `src/lib` (frontend) are shared by everyone and depend on no module. The one exception is the pure M01 permission matrix read by the backend authorisation guard.

**Domain events.** Event names are stable strings `<entity>.<verb>` (e.g. `supplier.invited`, `questionnaire.submitted`), exported as constants from the emitting module and listed in its spec §10. Until M12 ships an event bus, a module that needs another's reaction calls that module's exported service directly and the spec records the intended event; the call is replaced by the event when the bus exists.

### 3.3 Enforcement

`resilisense/module-boundaries` (identical in both repos: `scripts/module-boundaries.mjs`, unit-tested) runs in `npm run lint`:

- an import from module A into module B must resolve to B's folder or `B/index`;
- `src/common`, `src/infra`, `src/config` (backend) and `src/components`, `src/lib` (frontend) may not import modules or the app shell.

Composition roots (`src/app.module.ts`, `src/worker.ts`, `src/app/router.tsx`) are outside the module root and may import any module's entry files.

## 4. Building a module independently

| Step | Backend | Frontend |
| --- | --- | --- |
| Contract fakes | For each dependency, a small fake implementing the exported service's methods, in `src/modules/<module>/__tests__/fakes/`; e2e tests seed the kernel tables only | Per-feature MSW handlers in `src/features/<module>/mocks.ts`, merged into `src/mocks/handlers.ts`; validated against `api/openapi.json` like all mocks |
| API first | Write `dto/` + controller signatures and regenerate `openapi.json` before the services, so the frontend can start | `npm run api:sync` against the backend branch's `openapi.json` while it is in review; switch to `main` when merged |
| Registration | One import in `app.module.ts` (and `worker.ts` for processors); entitlement + permissions in the M01 matrix | One spread in `router.tsx`, one entry in `nav.ts`, one namespace in `src/locales/en/` |
| Done | Lint (boundaries), typecheck, unit + e2e, spec coverage, `openapi.json` regenerated, module card current | Lint (boundaries, logical properties), typecheck, unit + MSW page tests, Playwright + axe, Storybook for new `ui/` or chart components, module card current |

A module whose dependency is not built yet still ships: its fakes stand in, and the dependency's contract in its spec is the agreement. When the dependency lands, the fake is checked against the real public surface by `/check-module`.

## 5. Due diligence module catalogue

Folder names are the same in both repos. Plan IDs refer to the "Supplier Due Diligence App: Module Plan" (SD01–SD16). Specs marked *(new)* are written by `/module-contract` from `modules/_TEMPLATE.md`, mostly by splitting M10; the numbers M19–M26 are proposed and fixed when each spec lands. Until then M10 is their spec.

| Folder | Plan | Spec | Owns (main entities) | Public surface (summary) | Depends on | Emits |
| --- | --- | --- | --- | --- | --- | --- |
| `identity` | SD01 | M01 | users, sessions, roles, permissions | `IdentityModule`, `UsersRepository`, `IdentityMailer`, tokens, `decidePermission` | kernel | `auth.*`, `user.*` |
| `workspaces` | SD01 | M02 | workspaces, companies, entitlements, partner grants | `WorkspacesModule` | identity, audit | `workspace.*`, `company.*` |
| `audit` | SD13 | M12 | audit_events | `AuditService` | kernel | — |
| `files` | SD05 base | M14 | files, uploads, scans (behind `StorageAdapter`) | upload intent, file read model | kernel | `file.scanned` |
| `notifications` | SD13 | M12 | notifications, email outbox, event bus | `notify()`, event bus | kernel | — |
| `reference-data` | SD14 | M13 | countries, sectors, categories, risk indices, questionnaire templates | lookups by code, index values by year | kernel | `reference.updated` |
| `supplier-register` | SD02 | M10 §4.1 → M19 *(new)* | suppliers, sites, contacts, tags, imports | `getSupplier`, `listSuppliers`, supplier read model | workspaces, reference-data | `supplier.created`, `supplier.updated`, `supplier.archived` |
| `supplier-portal` | SD03 | M10 §4.1 → M20 *(new)* | supplier links, access requests, sharing grants | `accessFor(buyer, supplier, year)` | supplier-register, identity, notifications | `supplier.invited`, `supplier.linked`, `supplier_access.*` |
| `questionnaires` | SD04 | M08 + M21 *(new)* | templates, campaigns, responses, answer scores | campaign and response read models | reference-data, files, notifications | `questionnaire.sent`, `questionnaire.submitted` |
| `supplier-evidence` | SD05 | M14 + M10 §6 | supplier documents, certificates, expiry, verification | certificate status per supplier | files, supplier-register | `certificate.verified`, `certificate.expiring` |
| `risk` | SD06 | M10 §4.2 → M22 *(new)* | inherent and residual risk, factors, history | `riskOf(supplier)`, heat-map read model; pure `engine/` | reference-data, supplier-register; consumes questionnaire, evidence, audit, esg-data events | `supplier.risk.changed` |
| `screening` | SD07 | M10 §7 | ranking runs, tiers, saved filters | ranking read model | supplier-register, risk, supplier-portal | `screening.completed` |
| `dd-audits` | SD08 | M23 *(new)* | audit plans, checklists, findings | finding read model | supplier-register, files | `finding.raised` |
| `corrective-actions` | SD09 | M09 (`origin='supplier'`) | corrective action plans, responses, verification | CAP status per supplier | consumes `finding.raised` | `cap.overdue`, `cap.closed` |
| `monitoring` | SD10 | M24 *(new)* | reassessment cycles, alert rules, signals feed | alert read model | consumes events of all DD modules | `alert.raised` |
| `grievances` | SD11 | M25 *(new)* | grievance cases, public intake, anonymity | case status | supplier-register, notifications | `grievance.received` |
| `dd-reporting` | SD12 | M11 + M16 | report definitions, renders, exports | report jobs | public read models of the modules above | `report.ready` |
| `esg-data` | SD16 | M26 *(new, optional)* | external ratings cache (CSRhub adapter) | rating by supplier and month | supplier-register | `external_rating.updated` |
| `localisation` | SD15 | M15 | translations of content | — (frontend `src/lib/i18n`) | kernel | — |

Rules that the catalogue fixes:

- **Risk never reads another module's tables.** It receives facts through events or exported queries, so the pure engine can be built and tested first with fixtures.
- **Scores are computed only in backend engines** (`risk`, `screening`, `questionnaires` answer scores); the frontend formats and visualises them (CLAUDE.md).
- **Supplier-facing surfaces** (portal, questionnaire answering, grievance intake) use the public minimal shell (`02` §3) and the M08 public entry.

## 6. Build waves

Modules in the same wave have no dependency on each other and can run in parallel sessions (one per module per repo). A module may also start one wave early against contract fakes.

| Wave | Backend + frontend modules | Unlocks |
| --- | --- | --- |
| 0 · built | identity, workspaces, audit | — |
| 1 · foundations | files, notifications, reference-data, localisation | uploads, events, indices |
| 2 · usable loop | supplier-register, questionnaires, grievances, `risk/engine` (pure) | Phase A: register, invite, questionnaire |
| 3 · judgement | supplier-portal, supplier-evidence, risk (service), corrective-actions | Phase B: risk scores, sharing, CAPs |
| 4 · assurance | screening, dd-audits, monitoring, dd-reporting, esg-data (licence permitting) | Phase B/C: ranking, audits, alerts, reports |

The roadmap order in `05` §3 Step 7 still applies to the ISO 26000 chain (M03–M06), which follows the DD MVP (owner decision, 2026-10-04).

## 7. Skills that run the plan

Project skills live in `.claude/skills/` in both repos and chain into each other. Run them from a Claude Code session opened on the repo.

| Skill | Use it to | Produces |
| --- | --- | --- |
| `/module-contract <folder or Mxx>` | Write or refresh a module's spec section 14 (contract) and its module card, from this catalogue and the plan | Spec + `CLAUDE.md` changes in both repos, docs PRs |
| `/build-module <folder or Mxx>` | Implement one module in the current repo against its contract, with fakes for unbuilt dependencies | Code, tests, updated card, PR |
| `/check-module [folder]` | Audit boundaries, contract vs `index.ts`, card freshness, spec coverage, docs mirror, Calm Ledger UI rules | A findings table; with `--fix`, the fixes |

`/implement-module` (`.claude/commands/`) now hands over to `/build-module`.
