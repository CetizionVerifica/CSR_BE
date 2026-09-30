# 05 — Building ResiliSense 2.0 with Claude Code (playbook)

How to run the revamp with Claude Code on the web (claude.ai/code) — the same flow works in the Claude Code CLI on your own machine. Each step has a **copy-paste prompt**.

## 1. How a Claude Code session works here

- A session is a fresh cloud container with **both repos** cloned (`CSR_BE`, `Resilisense-FE`). Claude reads `CLAUDE.md` + `docs/revamp/` automatically, works on a `claude/…` branch, runs tests, commits, pushes and (when you ask) opens a **pull request**. You review and merge on GitHub.
- Sessions start from each repo's **default branch (`main`)** — so anything Claude should know (this spec pack, `CLAUDE.md`, `.claude/commands/`, the SessionStart hook) must be **merged to `main`** first (Step 1).
- What the container has (checked 2026-09-30): Ubuntu 24.04, Node 22, npm registry access, **PostgreSQL 16 and Redis installed but stopped**, Docker CLI but **no Docker daemon** (no `docker compose`, no Testcontainers). The scaffold adds a SessionStart hook that starts PostgreSQL/Redis and installs dependencies, and the code uses `local` storage and `log` email drivers in sessions.
- What a session **cannot** do: reach your VPS servers or production database, or use your personal credentials. Infra runs from CI or your machine (Step 6).
- **Never paste secrets or production personal data into a session.** Use the anonymisation script (Step 7) and only share anonymised fixtures.

**One module = one session = one PR** keeps reviews small. Independent modules can run in **parallel sessions** (see §4).

## 2. One-time setup (you, ~15 minutes)

1. **Environment settings** (cloud environment menu in the session title bar → *Edit*):
   - *Network access*: allow at least the npm registry, GitHub, `binaries.prisma.sh`, `nodejs.org` (for Node 24) and `cdn.playwright.dev`/`playwright.azureedge.net` if Playwright browsers need downloading (Chromium is pre-installed at `/opt/pw-browsers`). Access levels: https://code.claude.com/docs/en/claude-code-on-the-web
   - *Setup script* (optional, for Node 24 LTS instead of the image's Node 22):
     ```bash
     #!/bin/bash
     set -e
     curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.8/install.sh | bash
     export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"
     nvm install 24 && nvm alias default 24
     ```
   - *Secrets*: none needed for Phases 1–2 (all providers have local/fake drivers). Add an `ANTHROPIC_API_KEY` only when building M17 evals.
2. **GitHub**: make sure the Claude GitHub App can push to both repos and open PRs; turn on branch protection for `main` (require PR + CI green).
3. **Rotate the leaked credentials** listed in `00-current-state-review.md` §2.3 — this is a manual job only you can do.

## 3. The sequence

### Step 1 — Freeze legacy on a `legacy` branch and land this spec pack on `main` (safely)
Pushing to `main` currently **deploys legacy to production** (`CSR_BE/.github/workflows/nodejs-cicd.yml`, `Resilisense-FE/.github/workflows/main.yml`, and the Jenkins jobs). So the order matters:

1. You (GitHub UI) create branch **`legacy`** and tag **`legacy-v1`** from current `main` in both repos, and re-point the **Jenkins** jobs to the `legacy` branch (Jenkins config lives outside the repo).
2. Run this prompt:
   > In both repos: (a) open a PR **into `legacy`** that changes the deploy workflows and Jenkinsfiles to trigger on pushes to `legacy` and to deploy the `legacy` branch on the server (`git fetch && git checkout legacy && git pull origin legacy` instead of pulling `main`). (b) Open a PR **into `main`** from `claude/brave-keller-ynwjxp` (the spec pack + CLAUDE.md) that also deletes the legacy deploy workflows and Jenkinsfile from `main`, so merging to `main` can no longer deploy legacy. Don't change application code. Explain in each PR body what I must verify on the servers.
3. Merge the `legacy` PR first (production now deploys from `legacy`), check the site still works, then merge the `main` PR.

### Step 2 — Patch the live system (Phase 0)
Start the suggested task **"Patch critical auth holes in live CSR_BE"** (or paste its prompt into a new session) and tell it to target the **`legacy`** branch. Review and merge it quickly; the same session can then do the FE items (static build instead of the dev server, remove `/super-admin`, drop committed `build/` and source maps).

### Step 3 — Record the decisions
> Update `docs/revamp` in both repos with these decisions: VPS provider EU = ___, India = ___; object storage = ___; off-site backups = ___; database = PostgreSQL; launch languages = ___; stakeholder class weights = ___; reuse of SAQ/Carbon-Lens/GRI_tracker = ___. Mark the ADRs Accepted with today's date, resolve the matching open questions in the module specs, and set `Status: Ready` on M01, M02, M12, M13, M14 and M15. Keep both copies identical and open PRs.

All specs start as `Draft`; `/implement-module` refuses to build a spec that isn't `Ready`, so read each spec (at least §4, §5, §7, §13) before flipping it — that review is the most valuable hour you'll spend per module.

### Step 4 — Backend scaffold (`CSR_BE`, Phase 1 foundation)
> Read CLAUDE.md and docs/revamp (README, 01, M01, M02, M12 §2.4, M13 §3.2, M14, M15). On a new branch, replace the legacy code on `main` with the new NestJS scaffold described in 01 §3–§5: TypeScript strict, Prisma + PostgreSQL with the tenancy extension and one example RLS-protected table, env validation with Zod, pino with redaction, problem+json errors, `@Can`/`@Public` guards with the "every route is decorated" test, health endpoints, OpenAPI generation to `openapi.json`, BullMQ worker entry, `StorageAdapter` (s3 + local) and `EmailAdapter` (postmark + smtp + log) with tests, docker-compose for local machines, a `.claude` SessionStart hook for cloud sessions (start PostgreSQL 16 and Redis, create dev/test databases, `npm ci`), GitHub Actions CI (lint, typecheck, unit, e2e against a Postgres service, openapi diff, npm audit, gitleaks), and the reference-data seed (ISO 26000 taxonomy with 609 KCs from Docs/GapAnalysisV2.xlsx + legacy mappings, with the count assertions from M13 §7). Keep `docs/revamp`, `CLAUDE.md` and the `Docs/` source files. Don't implement feature modules yet. Run everything, then open a PR.

Use **plan mode** for this one (ask Claude to plan first, approve, then build).

### Step 5 — Frontend scaffold (`Resilisense-FE`) — can run in parallel with Step 4
> Read CLAUDE.md and docs/revamp (README, 01 ADR-008, 02-design-system, M01 §9, M15). Replace the legacy CRA app on `main` with the new Vite + React + TypeScript scaffold: Tailwind v4 with the design tokens from 02 §2 (light + dark, RTL-safe lint rule), shadcn/ui base components, the app shell (sidebar, top bar with workspace switcher placeholder, command palette, notification bell), React Router with lazy routes, 404 and error boundaries, i18next with en + pseudo-locale and `dir` handling, TanStack Query with an orval setup that reads `openapi.json` (use MSW mocks until the backend PR is merged), auth screens (sign-in, forgot/reset password, accept invite) against the M01 API contract, Storybook with a11y/RTL/dark toolbars, Vitest + Playwright + axe, Dockerfile + Caddyfile for the `web` image, and GitHub Actions CI. Keep `docs/revamp` and `CLAUDE.md`. Open a PR.

### Step 6 — Infrastructure as code (VPS)
> Following 01 ADR-011, add `infra/ansible/` (inventory for staging, app-1, data-1; roles for base hardening, Docker, PostgreSQL 16 + pgBackRest to an off-site S3-compatible repo, Valkey, node_exporter), Kamal 2 configs (`config/deploy.yml`, `config/deploy.staging.yml`, `.kamal/secrets` reading from GitHub secrets) for `api`/`worker`/`clamav` in CSR_BE and `web` in Resilisense-FE, deploy workflows (staging on `main`, production on release tag with approval), and runbooks (deploy, rollback, restore, fail-over, disk full, key compromise). Lint with `ansible-lint`; don't run anything against real servers. Open PRs.

Then **you** run Ansible once against the new VPSs from your machine (or a CI job with the SSH key as a secret), add the GitHub secrets, and merge. Claude Code on your own computer (CLI) can help with this interactively because it can reach your servers from there.

### Step 7 — Build modules (the main loop)
Order (from the roadmap): **M01 → M02 → M14 → M12 (audit + email) → M13 (platform admin + seed) → M15**, then **M03 → M04 → M05 → M07 → M08 → M06 → M16 → M11**, then **M09 → M10 → M17 → M18**.

For each module, backend first, then frontend:
> `/implement-module M04` *(or:)* Implement module M04 in CSR_BE exactly as specified in docs/revamp/modules/M04-gap-analysis.md (scope §4.1, engine §7, API §8, migration notes §11). Plan first. Engines as pure functions with table-driven tests for every edge case in the spec; e2e tests for happy path, forbidden role, other-workspace access and locked state. Regenerate openapi.json. If the spec is ambiguous or wrong, stop and propose a spec change instead of guessing. Open a PR that references the spec sections.

Then in a new session:
> `/implement-module M04` in Resilisense-FE: build the UI of M04 §9 with the design-system patterns from 02 §5 (assessment workspace), using only the generated API hooks from the merged backend openapi.json. Loading/empty/error states, i18n keys, RTL and dark mode, keyboard support, Storybook stories for new components, Playwright journey + axe. Open a PR.

**Golden-master fixtures** (M04/M05/M06): ask Claude to write `etl/anonymise.ts` (hash names/emails, keep structure and numbers), run it **yourself** where the Mongo snapshot lives, and commit only the anonymised JSON to `test/fixtures/golden/` — then ask Claude to write the golden-master tests against it.

### Step 8 — Review, CI, merge
- In the session: `/code-review` (correctness) and `/security-review` before opening the PR.
- After the PR is open: say **"watch this PR"** — Claude subscribes to CI and review comments and pushes fixes until green.
- Your review: check behaviour against the spec's acceptance criteria (§5 of each module), not just the code. Merge when CI is green.
- After merge, start the next module's session from `main`.

### Step 9 — Migration & cut-over (Phase 3)
> Implement the ETL in `CSR_BE/etl/` per `docs/revamp/04-data-migration.md` for entities 1–N, with the data-quality rules in §3, the report in §1 and validation in §4. Tests use the anonymised fixtures. Open a PR.
You run the dry runs (DR1–DR3) against snapshots on your infrastructure; Claude fixes what the ETL reports show.

## 4. Running sessions in parallel

| Can run together | Why |
|---|---|
| Step 2 (legacy hotfix) + Step 4 (BE scaffold) + Step 5 (FE scaffold) | different branches/bases |
| BE module X + FE module X−1 | FE depends only on the merged API of the previous module |
| M07 (people) + M14 (files) + M15 (i18n) | no shared tables |
| Avoid in parallel | two sessions touching `prisma/schema.prisma` heavily at once (merge conflicts) — split by module and rebase often |

## 5. Keeping quality high

- Specs first: if a PR changes behaviour, the PR must update the spec in **both** repos (CLAUDE.md enforces this).
- Small PRs (< ~800 changed lines excluding generated files); ask Claude to split otherwise.
- Every PR: lint, typecheck, tests, `openapi.json` regenerated (BE), axe clean (FE).
- Keep `CLAUDE.md` current: when you correct Claude on a convention twice, add it to `CLAUDE.md`.
- Ask for a **weekly status report**: *"Summarise merged PRs this week against the roadmap phases in docs/revamp/03, list open spec questions, and propose next week's sessions."*

## 6. Project slash commands

`.claude/commands/implement-module.md` (in both repos) turns the module prompt into `/implement-module <Mxx> [notes]`. Add more commands when a prompt gets reused three times.
