-- CreateEnum
CREATE TYPE "taxonomy_status" AS ENUM ('draft', 'published', 'retired');

-- CreateEnum
CREATE TYPE "answer_type" AS ENUM ('header', 'yes_no', 'legal_3', 'yes_count', 'ratio_band', 'gender_pay_gap');

-- CreateEnum
CREATE TYPE "workspace_status" AS ENUM ('trial', 'active', 'suspended', 'closed');

-- CreateTable
CREATE TABLE "taxonomy_versions" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "status" "taxonomy_status" NOT NULL DEFAULT 'draft',
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "taxonomy_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_subjects" (
    "id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "core_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issues" (
    "id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "core_subject_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "key_considerations" (
    "id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "issue_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "legacy_key" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "group_index" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "evidence_hint" TEXT,
    "answer_type" "answer_type" NOT NULL,
    "answer_options" JSONB NOT NULL,
    "scoring_rule" JSONB NOT NULL,
    "evidence_required" BOOLEAN NOT NULL DEFAULT true,
    "is_header" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "key_considerations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "workspace_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "legal_name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "country" CHAR(2),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "taxonomy_versions_code_key" ON "taxonomy_versions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "core_subjects_version_id_key_key" ON "core_subjects"("version_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "core_subjects_version_id_code_key" ON "core_subjects"("version_id", "code");

-- CreateIndex
CREATE INDEX "issues_core_subject_id_idx" ON "issues"("core_subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "issues_version_id_key_key" ON "issues"("version_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "issues_version_id_code_key" ON "issues"("version_id", "code");

-- CreateIndex
CREATE INDEX "key_considerations_issue_id_idx" ON "key_considerations"("issue_id");

-- CreateIndex
CREATE UNIQUE INDEX "key_considerations_version_id_code_key" ON "key_considerations"("version_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "key_considerations_version_id_legacy_key_key" ON "key_considerations"("version_id", "legacy_key");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_slug_key" ON "workspaces"("slug");

-- CreateIndex
CREATE INDEX "companies_workspace_id_idx" ON "companies"("workspace_id");

-- AddForeignKey
ALTER TABLE "core_subjects" ADD CONSTRAINT "core_subjects_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "taxonomy_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "taxonomy_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_core_subject_id_fkey" FOREIGN KEY ("core_subject_id") REFERENCES "core_subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "key_considerations" ADD CONSTRAINT "key_considerations_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "taxonomy_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "key_considerations" ADD CONSTRAINT "key_considerations_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
