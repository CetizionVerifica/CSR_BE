---
name: run-plan
description: Run the ResiliSense modular build plan hands-free — read where every module stands, pick the next step (contract, backend build, frontend build), run it with the other project skills, open and drive the PRs, and improve the skills from what the run learned. Use for "/run-plan", "build the next module", "continue the plan", or a scheduled routine run.
argument-hint: '[module folder] [--parallel N] [--max-open N] [--dry-run]'
---

# Run plan

The one command the owner needs. It decides what to build next from the repos themselves (no hand-kept tracker), chains `/module-contract`, `/build-module` and `/check-module`, and keeps those skills up to date so nobody writes skills by hand. Identical in both repos. Plan: `docs/revamp/06-modular-build.md` §8.

## 0. Setup

1. Both repos side by side (`../CSR_BE`, `../Resilisense-FE`). Missing one → work only on steps for the repo present and say the other is needed.
2. In each repo: `git fetch origin main`, start from `origin/main`, and make sure the SessionStart setup ran (backend: PostgreSQL + Redis up; `npm ci` done).

## 1. Where the plan stands

1. `npm run plan:status -- --json` (from either repo). It returns every module's `next` step — `contract`, `approve`, `build-be`, `build-fe`, `blocked`, `done` — and a `queue` ordered by wave: finish started modules first, then approvals, then new contracts.
2. **In flight.** List open PRs in both repos whose branch starts with `claude/module-`. A module with an open PR is in flight and is never started again. Before anything new, for each in-flight PR you own: merge conflict or red CI → fix it now (that is this run's work); unanswered review comments → address them.
3. **Back-pressure.** If `--max-open` (default 2) module PRs are green and waiting for the owner to merge, start nothing new: report what waits and stop. Work piles up faster than it can be reviewed otherwise.
4. `--dry-run` → print the table, the in-flight PRs and what you would do, then stop.

## 2. Pick the work

- Argument given → that module (refuse with the reason if its step is `blocked` or `done`).
- Otherwise the first queue entry that is not in flight. `approve` entries are not work: list them in the report (the contract PR waits for the owner).
- `--parallel N` (max 3): take up to N queue entries that do not depend on each other (`dependsOn` in `docs/revamp/plan.json`) and run each in its own subagent with `isolation: "worktree"`, giving it this skill's §3–§5 for its one module. Never run two steps of the same module at once.

## 3. Do the step

Branches: `claude/module-<folder>-contract` for contracts, `claude/module-<folder>` for builds (same name in both repos).

- **contract** → follow `/module-contract <folder>`, plus:
  - a new spec takes its `proposedSpec` id; set `"spec"` for the module in `docs/revamp/plan.json` (both repos) in the same PR;
  - if every question in spec §13 is answered by the plan, the catalogue or an earlier owner decision (project memory), set the spec status to `Ready` in the PR: **the owner merging the contract PR is the approval**. Otherwise leave it `Draft` and put the questions, each with a recommended answer, at the top of the PR body.
  - open both docs PRs (backend first) and link them to each other.
- **build-be** → in `CSR_BE`, follow `/build-module <folder>`. Unbuilt dependencies get fakes (06 §4); never wait for them.
- **build-fe** → only when the backend module is on `main` (`plan:status` says so). In `Resilisense-FE`, follow `/build-module <folder>`.
- After a build: `/check-module <folder>` and fix every finding before opening the PR.
- Open the PR, subscribe to its activity and drive it to green (fix CI, answer reviews). Never merge: merging waits for the owner's explicit "merge", backend PR before frontend.

## 4. Learn — keep the skills current

Before the final commit of each PR, review the run:

1. Every multi-step thing you did by hand that no skill or `CLAUDE.md` told you (a migration trick, a test helper, a registration step), every instruction that was wrong or missing and caused a red check, every question you had to look up twice.
2. For each, edit the narrowest place that would have told the next run: the module card, the layer `CLAUDE.md`, or the `SKILL.md` of the skill that owns that step. Prefer adding a line to an existing step over adding a step.
3. A procedure that fits no existing skill and will recur for other modules → a new `.claude/skills/<name>/SKILL.md` (frontmatter `name`, `description` saying when to use it, `argument-hint`; body: inputs, steps, output), and a row in 06 §7. Keep the project to at most six skills: merge before adding.
4. Copy every changed skill and `docs/revamp` file to the sibling repo (they stay identical) and list the changes under **Playbook updates** in the PR body, one line each with the reason.
5. Never use this step to relax a gate: no weaker lint rule, coverage floor, test, permission or review rule.

## 5. Report

One short summary (the thread, or the routine's run output): what was done with PR links, what waits for the owner (merges, contract questions with the recommended answers), what is next in the queue, and the playbook updates made. Nothing done because of back-pressure or a blocker → say exactly which.

## Never

Merge a PR; flip a spec to `Ready` outside a contract PR; start a module whose dependency has no contract; skip, disable or weaken a test or check; rewrite history on a branch you did not create; add AWS services (ADR-011); put secrets in code, docs or logs.
