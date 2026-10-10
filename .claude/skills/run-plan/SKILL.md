---
name: run-plan
description: Run the ResiliSense modular build plan hands-free — read where every module stands, pick the next steps (contract, backend build, frontend build), run them with the other project skills in parallel, drive the PRs to green, merge them one at a time once /check-module passes, and improve the skills from what the run learned. Use for "/run-plan", "build the next module", "continue the plan", or a scheduled routine run.
argument-hint: '[module folder] [--parallel N] [--max-open N] [--no-merge] [--dry-run]'
---

# Run plan

The one command the owner needs. It decides what to build next from the repos themselves (no hand-kept tracker), chains `/module-contract`, `/build-module` and `/check-module`, merges what passes the gates (§6), and keeps those skills up to date so nobody writes skills by hand. Identical in both repos. Plan: `docs/revamp/06-modular-build.md` §8.

## 0. Setup

1. Both repos side by side (`../CSR_BE`, `../Resilisense-FE`). Missing one → work only on steps for the repo present and say the other is needed.
2. In each repo: `git fetch origin main`, start from `origin/main`, and make sure the SessionStart setup ran (backend: PostgreSQL + Redis up; `npm ci` done).

## 1. Where the plan stands

1. `npm run plan:status -- --json` (from either repo). It returns every module's `next` step — `contract`, `approve`, `build-be`, `build-fe`, `blocked`, `done` — and a `queue` ordered by wave: finish started modules first, then approvals, then new contracts.
2. **In flight.** List open PRs in both repos whose branch starts with `claude/module-`. A module with an open PR is in flight and is never started again. For each in-flight PR you own: merge conflict or red CI → fix it now (that is this run's work); unanswered review comments → address them.
3. **Merge first.** Run §6 on the in-flight PRs before starting anything new: merged work unblocks the queue (`build-fe` waits for its backend on `main`). Then run `plan:status` again.
4. **Back-pressure.** If `--max-open` (default 4) module PRs are still open after §6 (red, conflicted, or waiting for the owner), start nothing new: report what blocks them and stop.
5. `--dry-run` → print the table, the in-flight PRs, what would merge and what you would start, then stop.

## 2. Pick the work

- Argument given → that module (refuse with the reason if its step is `blocked` or `done`).
- Otherwise the queue entries that are not in flight. `approve` entries are not work: list them in the report (the contract PR waits for the owner's answers).
- `--parallel N` (default 3, max 3): take up to N queue entries that do not depend on each other (`dependsOn` in `docs/revamp/plan.json`) and run each in its own subagent with `isolation: "worktree"`, giving it this skill's §3–§4 for its one module. Subagents open PRs but **never merge**; the run that started them merges (§6), one PR at a time. Never run two steps of the same module at once.

## 3. Do the step

Branches: `claude/module-<folder>-contract` for contracts, `claude/module-<folder>` for builds (same name in both repos).

- **contract** → follow `/module-contract <folder>`, plus:
  - a new spec takes its `proposedSpec` id; set `"spec"` for the module in `docs/revamp/plan.json` (both repos) in the same PR;
  - if every question in spec §13 is answered by the plan, the catalogue or an earlier owner decision (project memory), set the spec status to `Ready` in the PR; it then merges through §6. Otherwise leave it `Draft`, put the questions, each with a recommended answer, at the top of the PR body, and label the PR `needs-owner`: it waits for the owner's answers.
  - open both docs PRs (backend first) and link them to each other.
- **build-be** → in `CSR_BE`, follow `/build-module <folder>`. Unbuilt dependencies get fakes (06 §4); never wait for them.
- **build-fe** → only when the backend module is on `main` (`plan:status` says so). In `Resilisense-FE`, follow `/build-module <folder>`.
- After a build: `/check-module <folder>` and fix every finding before opening the PR. Record the verdict on the PR (§6.2) so the merge step does not run it again.
- Open the PR, subscribe to its activity and drive it to green (fix CI, answer reviews).

## 4. Learn — keep the skills current

Before the final commit of each PR, review the run:

1. Every multi-step thing you did by hand that no skill or `CLAUDE.md` told you (a migration trick, a test helper, a registration step), every instruction that was wrong or missing and caused a red check, every question you had to look up twice.
2. For each, edit the narrowest place that would have told the next run: the module card, the layer `CLAUDE.md`, or the `SKILL.md` of the skill that owns that step. Prefer adding a line to an existing step over adding a step.
3. A procedure that fits no existing skill and will recur for other modules → a new `.claude/skills/<name>/SKILL.md` (frontmatter `name`, `description` saying when to use it, `argument-hint`; body: inputs, steps, output), and a row in 06 §7. Keep the project to at most six skills: merge before adding.
4. Copy every changed skill and `docs/revamp` file to the sibling repo (they stay identical) and list the changes under **Playbook updates** in the PR body, one line each with the reason.
5. Never use this step to relax a gate: no weaker lint rule, coverage floor, test, permission or review rule.

## 5. Report

One short summary (the thread, or the routine's run output): what was merged and what was opened, with PR links; what waits for the owner (contract questions with recommended answers, PRs held back by §6.1); what is next in the queue; and the playbook updates made. Nothing done because of back-pressure or a blocker → say exactly which.

## 6. Merge

Owner decision (Shyam, 2026-10-10): module PRs that pass these gates merge without asking. Only the run that owns the queue merges; parallel subagents never do. `--no-merge` skips this section.

1. **Eligible.** An open PR on a `claude/module-*` branch that this plan opened, not draft, without the `needs-owner` or `api-breaking` label, not touching `.github/`, `infra/`, `config/deploy*` or `Dockerfile*`, and with no migration that drops or renames a column or table. Anything else waits for the owner's "merge" and is listed in the report.
2. **Checked once.** `/check-module <folder>` must pass on the PR's current head. Its verdict lives in one PR comment ending with `<!-- check-module sha=<head sha> verdict=pass -->`. If that marker exists for the current head, do not run the check again; if the head moved, run it again and edit that comment with the new sha. For a contract PR the check covers the module card, the docs and skills mirror and the catalogue (checks 4 and 7).
3. **Green and current.** Every check run on the head is completed and successful, no review thread is unresolved, `mergeable_state` is `clean`, and the branch contains the latest `main`. If it is behind, merge `main` into it, push, and leave it for a later pass once CI is green on the new head.
4. **Order, one at a time.** Backend before frontend; a module's contract before its build; lower wave first. Merge one PR, re-read the state, then the next; never two PRs of the same repo in parallel. Squash, title `<PR title> (#n)`, with `expectedHeadSha` set to the head you checked.
5. **After each merge.** Fetch `main`, then for every other open `claude/module-*` PR in that repo merge `main` into its branch (in `docs/revamp/plan.json` and 06 §5 conflicts keep both sides' rows; regenerate `openapi.json` and lockfiles with the repo's tooling, never by hand), validate, push, and let CI run again. A frontend build PR merges only after its backend PR is on `main` and `npm run api:sync` against `main` leaves `api/openapi.json` unchanged.
6. **Something looks wrong** (check-module finds a boundary or contract break, CI goes red on `main` after a merge, a conflict where either side loses behaviour) → stop merging, fix or revert with a PR, and report it.

## Never

Merge a PR outside §6, or from a subagent; flip a spec to `Ready` outside a contract PR; start a module whose dependency has no contract; skip, disable or weaken a test or check; rewrite history on a branch you did not create; add AWS services (ADR-011); put secrets in code, docs or logs.
