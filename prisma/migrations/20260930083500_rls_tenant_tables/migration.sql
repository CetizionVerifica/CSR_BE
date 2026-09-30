-- Row-level security for tenant-owned tables (ADR-003).
-- The request's workspace is set per transaction with:
--   SELECT set_config('app.workspace_id', '<uuid>', true);
-- No setting (or empty) => NULL => no rows visible and no writes allowed (deny by default).
-- FORCE makes the table owner subject to RLS too, so the API role cannot bypass it.
-- Cross-tenant platform jobs (assessors, ETL) will use a separate BYPASSRLS role.

CREATE OR REPLACE FUNCTION app_current_workspace() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.workspace_id', true), '')::uuid $$;

ALTER TABLE "companies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "companies" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "companies"
  USING ("workspace_id" = app_current_workspace())
  WITH CHECK ("workspace_id" = app_current_workspace());
