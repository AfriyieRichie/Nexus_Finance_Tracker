-- ============================================================
-- Fixed Assets v2 Migration
-- Run this in the Neon SQL Editor (console.neon.tech)
-- Safe to run more than once — all statements are idempotent
-- ============================================================

-- 1. Add SUM_OF_YEARS_DIGITS to DepreciationMethod enum
DO $$ BEGIN
  ALTER TYPE "DepreciationMethod" ADD VALUE 'SUM_OF_YEARS_DIGITS';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 2. Create DepreciationRunStatus enum
DO $$ BEGIN
  CREATE TYPE "DepreciationRunStatus" AS ENUM ('POSTED', 'REVERSED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 3. Add new columns to fixed_assets
ALTER TABLE "fixed_assets"
  ADD COLUMN IF NOT EXISTS "categoryId"                TEXT,
  ADD COLUMN IF NOT EXISTS "serialNumber"              TEXT,
  ADD COLUMN IF NOT EXISTS "location"                  TEXT,
  ADD COLUMN IF NOT EXISTS "impairmentLoss"            DECIMAL(20,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "unitsOfProductionTotal"    INTEGER,
  ADD COLUMN IF NOT EXISTS "depreciationMonthsElapsed" INTEGER NOT NULL DEFAULT 0;

-- 4. asset_categories
CREATE TABLE IF NOT EXISTS "asset_categories" (
  "id"                        TEXT          NOT NULL,
  "organisationId"            TEXT          NOT NULL,
  "code"                      TEXT          NOT NULL,
  "name"                      TEXT          NOT NULL,
  "description"               TEXT,
  "defaultDepreciationMethod" "DepreciationMethod" NOT NULL DEFAULT 'STRAIGHT_LINE',
  "defaultUsefulLifeMonths"   INTEGER,
  "capitalisationThreshold"   DECIMAL(20,4),
  "isActive"                  BOOLEAN       NOT NULL DEFAULT true,
  "isDeleted"                 BOOLEAN       NOT NULL DEFAULT false,
  "createdAt"                 TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                 TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "asset_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "asset_categories_organisationId_code_key"
  ON "asset_categories"("organisationId", "code");
CREATE INDEX IF NOT EXISTS "asset_categories_organisationId_idx"
  ON "asset_categories"("organisationId");

DO $$ BEGIN
  ALTER TABLE "asset_categories"
    ADD CONSTRAINT "asset_categories_organisationId_fkey"
    FOREIGN KEY ("organisationId") REFERENCES "organisations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 5. FK: fixed_assets -> asset_categories
DO $$ BEGIN
  ALTER TABLE "fixed_assets"
    ADD CONSTRAINT "fixed_assets_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "asset_categories"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 6. asset_revaluations
CREATE TABLE IF NOT EXISTS "asset_revaluations" (
  "id"                    TEXT         NOT NULL,
  "organisationId"        TEXT         NOT NULL,
  "assetId"               TEXT         NOT NULL,
  "revaluationDate"       DATE         NOT NULL,
  "fairValue"             DECIMAL(20,4) NOT NULL,
  "previousCarryingValue" DECIMAL(20,4) NOT NULL,
  "surplusDeficit"        DECIMAL(20,4) NOT NULL,
  "journalEntryId"        TEXT,
  "notes"                 TEXT,
  "createdBy"             TEXT         NOT NULL,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "asset_revaluations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "asset_revaluations_assetId_idx"
  ON "asset_revaluations"("assetId");
CREATE INDEX IF NOT EXISTS "asset_revaluations_organisationId_idx"
  ON "asset_revaluations"("organisationId");

DO $$ BEGIN
  ALTER TABLE "asset_revaluations"
    ADD CONSTRAINT "asset_revaluations_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "fixed_assets"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "asset_revaluations"
    ADD CONSTRAINT "asset_revaluations_organisationId_fkey"
    FOREIGN KEY ("organisationId") REFERENCES "organisations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 7. asset_impairments
CREATE TABLE IF NOT EXISTS "asset_impairments" (
  "id"                    TEXT         NOT NULL,
  "organisationId"        TEXT         NOT NULL,
  "assetId"               TEXT         NOT NULL,
  "impairmentDate"        DATE         NOT NULL,
  "impairmentAmount"      DECIMAL(20,4) NOT NULL,
  "previousCarryingValue" DECIMAL(20,4) NOT NULL,
  "newCarryingValue"      DECIMAL(20,4) NOT NULL,
  "journalEntryId"        TEXT,
  "notes"                 TEXT,
  "createdBy"             TEXT         NOT NULL,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "asset_impairments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "asset_impairments_assetId_idx"
  ON "asset_impairments"("assetId");
CREATE INDEX IF NOT EXISTS "asset_impairments_organisationId_idx"
  ON "asset_impairments"("organisationId");

DO $$ BEGIN
  ALTER TABLE "asset_impairments"
    ADD CONSTRAINT "asset_impairments_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "fixed_assets"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "asset_impairments"
    ADD CONSTRAINT "asset_impairments_organisationId_fkey"
    FOREIGN KEY ("organisationId") REFERENCES "organisations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 8. depreciation_runs
CREATE TABLE IF NOT EXISTS "depreciation_runs" (
  "id"             TEXT                   NOT NULL,
  "organisationId" TEXT                   NOT NULL,
  "periodId"       TEXT                   NOT NULL,
  "asOfDate"       DATE                   NOT NULL,
  "processedCount" INTEGER                NOT NULL,
  "totalAmount"    DECIMAL(20,4)          NOT NULL,
  "status"         "DepreciationRunStatus" NOT NULL DEFAULT 'POSTED',
  "reversedAt"     TIMESTAMP(3),
  "reversedBy"     TEXT,
  "createdBy"      TEXT                   NOT NULL,
  "createdAt"      TIMESTAMP(3)           NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "depreciation_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "depreciation_runs_organisationId_idx"
  ON "depreciation_runs"("organisationId");

DO $$ BEGIN
  ALTER TABLE "depreciation_runs"
    ADD CONSTRAINT "depreciation_runs_organisationId_fkey"
    FOREIGN KEY ("organisationId") REFERENCES "organisations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 9. depreciation_run_entries
CREATE TABLE IF NOT EXISTS "depreciation_run_entries" (
  "id"             TEXT         NOT NULL,
  "runId"          TEXT         NOT NULL,
  "assetId"        TEXT         NOT NULL,
  "amount"         DECIMAL(20,4) NOT NULL,
  "journalEntryId" TEXT         NOT NULL,
  CONSTRAINT "depreciation_run_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "depreciation_run_entries_runId_idx"
  ON "depreciation_run_entries"("runId");

DO $$ BEGIN
  ALTER TABLE "depreciation_run_entries"
    ADD CONSTRAINT "depreciation_run_entries_runId_fkey"
    FOREIGN KEY ("runId") REFERENCES "depreciation_runs"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "depreciation_run_entries"
    ADD CONSTRAINT "depreciation_run_entries_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "fixed_assets"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
