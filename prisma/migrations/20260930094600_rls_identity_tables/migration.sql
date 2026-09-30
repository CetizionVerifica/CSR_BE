-- Row-level security for the tenant-owned tables added with M01 (pattern: *_rls_tenant_tables).
-- users, memberships, partner_grants and the token tables span workspaces and are reached only
-- through the identity repositories (M01 §6).

-- Explicit, audited platform scope for cross-tenant reads (e.g. platform-level audit events).
-- Set per transaction by PrismaService.withPlatformScope(); never by user input.
CREATE OR REPLACE FUNCTION app_platform_scope() RETURNS boolean
  LANGUAGE sql STABLE
  AS $$ SELECT COALESCE(current_setting('app.platform_scope', true), '') = 'on' $$;

ALTER TABLE "invitations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invitations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "invitations"
  USING ("workspace_id" = app_current_workspace())
  WITH CHECK ("workspace_id" = app_current_workspace());

ALTER TABLE "entitlements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "entitlements" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "entitlements"
  USING ("workspace_id" = app_current_workspace())
  WITH CHECK ("workspace_id" = app_current_workspace());

-- audit_events is append-only (M12): rows can be inserted from any context and read only within
-- their workspace or the platform scope. No UPDATE/DELETE policy exists, so both are denied.
ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_insert ON "audit_events" FOR INSERT WITH CHECK (true);
CREATE POLICY audit_select ON "audit_events" FOR SELECT
  USING ("workspace_id" = app_current_workspace() OR app_platform_scope());
