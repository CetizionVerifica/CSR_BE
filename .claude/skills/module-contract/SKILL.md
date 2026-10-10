---
name: module-contract
description: Write or refresh one ResiliSense module's contract before it is built — spec §14, the module card (CLAUDE.md) in both repos and its catalogue row in docs/revamp/06. Use when starting a new module (e.g. a due diligence module like supplier-register or risk), splitting M10, or when a module's public surface, events or dependencies change.
argument-hint: <module folder or spec id, e.g. supplier-register | M10> [notes]
---

# Module contract

Turns one plan item into an agreed contract that both repos can build against independently. Identical in `CSR_BE` and `Resilisense-FE`; run it from either repo. It changes documents and `CLAUDE.md` files only, never application code.

## Inputs to read first

1. Root `CLAUDE.md`, `docs/revamp/06-modular-build.md` (§2 card format, §3 coupling rules, §5 catalogue, §6 waves) and `docs/revamp/README.md`.
2. The module's spec in `docs/revamp/modules/` (find it from the catalogue row; for a _(new)_ spec, the parent spec it is split from, usually M10) and the specs of every module it depends on, at least their §8 and §14.
3. The layer file: `src/modules/CLAUDE.md` (backend) or `src/features/CLAUDE.md` (frontend), and the existing module card if there is one.
4. Code that already exists for the module or its dependencies: their `index.ts` files are the real public surfaces.

## Steps

1. **Resolve the module.** Map the argument to its catalogue row: folder name, plan id (SDxx), spec id, wave. If the argument is not in the catalogue, stop and propose the row (folder, owns, public surface, depends on, emits) instead of inventing a module.
2. **Write or refresh the spec.**
   - New spec: copy `docs/revamp/modules/_TEMPLATE.md` to `docs/revamp/modules/<Mxx>-<folder>.md` with the next free id (06 §5 proposes M19–M26), status `Draft`, and fill §1–§13 from the parent spec and the plan; move the text out of the parent spec and leave a one-line pointer there. Story ids are `US-<nn>-<n>`.
   - Existing spec: keep its sections and fix only what the contract changes.
   - Fill **§14 Module contract**: owns (tables, routes, permissions, i18n namespace), public surface (each export and the consumer that needs it), depends on (other modules' public surfaces only, and the fake each test uses), emits and consumes (event name → payload / reaction).
3. **Check the coupling rules (06 §3).** No dependency on another module's tables, no foreign key outside the kernel tables, no score computed outside a backend `engine/`, no cycle between modules (A depends on B and B on A: break it with an event). If a rule cannot hold, stop and explain the trade-off with options.
4. **Update the catalogue.** Edit the module's row in `06-modular-build.md` §5 (and §6 if the wave changes) so it matches §14, and its entry in `docs/revamp/plan.json` (`spec` once the spec file exists, `wave`, `dependsOn`, `be`/`fe` folders). `npm run plan:status` must then show the module at `approve` or later.
5. **Write the module cards** in the format of 06 §2.1:
   - backend `src/modules/<folder>/CLAUDE.md`: tables, routes + `@Can` permissions, services and engine functions with their behaviour, events, invariants, e2e files and stories;
   - frontend `src/features/<folder>/CLAUDE.md`: routes and nav entry, pages with their loading / empty / error states, components with behaviour, keyboard and accessibility notes and Calm Ledger motion (`02` §9), charts used, stories.
     Create the folder with only the card when the module is not built yet. Status in the card = spec status.
6. **Mirror.** `docs/revamp/**` must be identical in both repos. If the sibling repo is checked out next to this one (`../CSR_BE`, `../Resilisense-FE`), copy the changed docs there and write its card too; otherwise say in the PR body that the sibling PR is needed.
7. **Validate.** `diff -r docs/revamp ../<sibling>/docs/revamp` is empty; `npx prettier --check` passes on the cards; every file and symbol a card names exists or is marked "planned".
8. **Deliver.** Commit `docs(<folder>): contract for <spec id>` on branch `claude/module-<folder>-contract` in each repo and open PRs that link each other. If spec §13 has no open question (everything is answered by the plan, the catalogue or a recorded owner decision), set the status to `Ready` in this PR: the owner merging it is the approval. Otherwise keep `Draft` and list the open questions, each with a recommended answer, at the top of the PR body.

## Output

Spec with §14, catalogue row, module cards in both repos, two linked PRs, and any open questions the owner must answer before `/build-module` can start.
