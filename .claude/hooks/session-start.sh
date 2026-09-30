#!/bin/bash
# SessionStart hook for Claude Code on the web (docs/revamp/05-claude-code-playbook.md).
# Cloud containers have no Docker daemon: start the native PostgreSQL + Redis, install
# dependencies, apply migrations and seed reference data so tests and lint work immediately.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

./scripts/dev-services.sh

[ -f .env ] || cp .env.example .env

# npm install (not ci) so the cached container state is reused between sessions.
npm install --no-audit --no-fund

npx prisma migrate deploy
npm run -s db:seed

echo "ResiliSense API dev environment ready (PostgreSQL + Redis running, migrations applied, reference data seeded)."
