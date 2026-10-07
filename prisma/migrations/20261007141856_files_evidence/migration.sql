-- CreateEnum
CREATE TYPE "file_purpose" AS ENUM ('evidence', 'logo', 'import', 'report', 'attachment', 'avatar');

-- CreateEnum
CREATE TYPE "file_status" AS ENUM ('pending', 'scanning', 'ready', 'quarantined', 'deleted');

-- CreateEnum
CREATE TYPE "file_version_status" AS ENUM ('pending', 'scanning', 'ready', 'quarantined', 'rejected');

-- CreateEnum
CREATE TYPE "file_link_entity" AS ENUM ('gap_answer', 'kpi_value', 'iro', 'action', 'supplier_document', 'comment');

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "purpose" "file_purpose" NOT NULL,
    "name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "current_version_id" UUID,
    "project_id" UUID,
    "uploaded_by" UUID NOT NULL,
    "status" "file_status" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_versions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "s3_key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "sha256" TEXT,
    "mime_detected" TEXT,
    "status" "file_version_status" NOT NULL DEFAULT 'pending',
    "scan_result" JSONB,
    "uploaded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "file_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_links" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "entity_type" "file_link_entity" NOT NULL,
    "entity_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "files_workspace_id_purpose_deleted_at_idx" ON "files"("workspace_id", "purpose", "deleted_at");

-- CreateIndex
CREATE INDEX "files_workspace_id_project_id_idx" ON "files"("workspace_id", "project_id");

-- CreateIndex
CREATE INDEX "file_versions_file_id_idx" ON "file_versions"("file_id");

-- CreateIndex
CREATE INDEX "file_versions_workspace_id_status_idx" ON "file_versions"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "file_links_workspace_id_entity_type_entity_id_idx" ON "file_links"("workspace_id", "entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "file_links_file_id_entity_type_entity_id_key" ON "file_links"("file_id", "entity_type", "entity_id");

-- AddForeignKey
-- NOT VALID: logo ids written before M14 (unchecked uuids) stay as they are; new writes are checked.
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_logo_file_id_fkey" FOREIGN KEY ("logo_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_logo_file_id_fkey" FOREIGN KEY ("logo_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_versions" ADD CONSTRAINT "file_versions_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_links" ADD CONSTRAINT "file_links_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security (ADR-003, pattern: *_rls_tenant_tables): files, versions and links are
-- visible and writable only inside their workspace.
ALTER TABLE "files" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "files" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "files"
  USING ("workspace_id" = app_current_workspace())
  WITH CHECK ("workspace_id" = app_current_workspace());

ALTER TABLE "file_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "file_versions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "file_versions"
  USING ("workspace_id" = app_current_workspace())
  WITH CHECK ("workspace_id" = app_current_workspace());

ALTER TABLE "file_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "file_links" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "file_links"
  USING ("workspace_id" = app_current_workspace())
  WITH CHECK ("workspace_id" = app_current_workspace());
