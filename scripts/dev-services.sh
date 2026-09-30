#!/usr/bin/env bash
# Starts PostgreSQL + Redis natively and creates the dev/test databases.
# Used by the Claude Code cloud SessionStart hook (no Docker daemon there) and
# usable on any Ubuntu dev box. On a laptop with Docker, `docker compose up -d` instead.
set -euo pipefail

DB_USER="${DB_USER:-resilisense}"
DB_PASSWORD="${DB_PASSWORD:-resilisense}"

as_postgres() {
  if [ "$(id -un)" = "postgres" ]; then "$@"; elif command -v sudo >/dev/null && [ "$(id -u)" != "0" ]; then sudo -u postgres "$@"; else su postgres -c "$(printf '%q ' "$@")"; fi
}

if command -v pg_lsclusters >/dev/null; then
  pg_lsclusters --no-header | grep -q online || service postgresql start >/dev/null
fi
if command -v redis-server >/dev/null; then
  redis-cli ping >/dev/null 2>&1 || service redis-server start >/dev/null
fi

for i in $(seq 1 20); do as_postgres psql -tAc 'select 1' >/dev/null 2>&1 && break; sleep 0.5; done

# Non-superuser role: tenant tables use FORCE ROW LEVEL SECURITY, so this role is subject to RLS.
as_postgres psql -v ON_ERROR_STOP=1 -tAc "DO \$\$BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} LOGIN CREATEDB PASSWORD '${DB_PASSWORD}';
  END IF;
END\$\$;" >/dev/null
for db in resilisense_dev resilisense_test; do
  as_postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname = '${db}'" | grep -q 1 \
    || as_postgres createdb -O "${DB_USER}" "${db}"
done
echo "PostgreSQL + Redis ready (databases: resilisense_dev, resilisense_test; role: ${DB_USER})"
