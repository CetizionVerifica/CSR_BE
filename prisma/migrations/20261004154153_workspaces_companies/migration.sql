-- M02: workspaces, companies, entitlements and reference data (docs/revamp/modules/M02-workspaces-companies.md §6).

-- CreateEnum
CREATE TYPE "data_region" AS ENUM ('eu', 'in', 'us');

-- CreateEnum
CREATE TYPE "workspace_created_via" AS ENUM ('platform', 'partner', 'self_service');

-- CreateEnum
CREATE TYPE "company_size_band" AS ENUM ('micro', 'small', 'medium', 'large');

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "address" JSONB,
ADD COLUMN     "contact_user_id" UUID,
ADD COLUMN     "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
ADD COLUMN     "description" TEXT,
ADD COLUMN     "employee_count" INTEGER,
ADD COLUMN     "fiscal_year_start_month" SMALLINT NOT NULL DEFAULT 1,
ADD COLUMN     "legacy_company_id" TEXT,
ADD COLUMN     "logo_file_id" UUID,
ADD COLUMN     "parent_company_id" UUID,
ADD COLUMN     "region" TEXT,
ADD COLUMN     "registration_no" TEXT,
ADD COLUMN     "sector_code" TEXT,
ADD COLUMN     "size_band" "company_size_band",
ADD COLUMN     "website" TEXT;

-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "branding" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "country" CHAR(2),
ADD COLUMN     "created_via" "workspace_created_via" NOT NULL DEFAULT 'platform',
ADD COLUMN     "data_region" "data_region" NOT NULL DEFAULT 'eu',
ADD COLUMN     "default_locale" TEXT NOT NULL DEFAULT 'en',
ADD COLUMN     "deleted_at" TIMESTAMPTZ(6),
ADD COLUMN     "legacy_agency_id" TEXT,
ADD COLUMN     "logo_file_id" UUID,
ADD COLUMN     "partner_workspace_id" UUID,
ADD COLUMN     "settings" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'UTC',
ADD COLUMN     "trial_ends_at" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "sectors" (
    "code" TEXT NOT NULL,
    "parent_code" TEXT,
    "label_key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "isic_code" TEXT,
    "nace_code" TEXT,

    CONSTRAINT "sectors_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "countries" (
    "code" CHAR(2) NOT NULL,
    "region" TEXT NOT NULL,
    "label_key" TEXT NOT NULL,

    CONSTRAINT "countries_pkey" PRIMARY KEY ("code")
);

-- CreateIndex
CREATE INDEX "companies_workspace_id_deleted_at_idx" ON "companies"("workspace_id", "deleted_at");

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_parent_company_id_fkey" FOREIGN KEY ("parent_company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_sector_code_fkey" FOREIGN KEY ("sector_code") REFERENCES "sectors"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sectors" ADD CONSTRAINT "sectors_parent_code_fkey" FOREIGN KEY ("parent_code") REFERENCES "sectors"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing rows got EUR; new companies must state their reporting currency.
ALTER TABLE "companies" ALTER COLUMN "currency" DROP DEFAULT;

-- Explicit, audited platform scope may read companies and entitlements across workspaces
-- (platform workspace list, M02 §8). Writes stay tenant-scoped.
CREATE POLICY platform_read ON "companies" FOR SELECT USING (app_platform_scope());
CREATE POLICY platform_read ON "entitlements" FOR SELECT USING (app_platform_scope());
