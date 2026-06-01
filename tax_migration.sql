-- Tax & Currency Module: Incremental Migration
-- Idempotent — safe to run more than once
-- Run this in the Neon SQL Editor

BEGIN;

-- ─── 1. New enums ─────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "TaxTreatment" AS ENUM ('STANDARD', 'ZERO_RATED', 'EXEMPT', 'REVERSE_CHARGE', 'IMPORT_VAT', 'WITHHOLDING');
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN
  CREATE TYPE "ExchangeRateType" AS ENUM ('SPOT', 'MONTHLY_AVERAGE', 'PERIOD_CLOSING');
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN
  CREATE TYPE "VatReturnStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'FILED');
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN
  CREATE TYPE "FxRevaluationStatus" AS ENUM ('POSTED', 'REVERSED');
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

-- ─── 2. tax_codes: new columns ────────────────────────────────────────────────

ALTER TABLE tax_codes
  ADD COLUMN IF NOT EXISTS "treatment"   "TaxTreatment" NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN IF NOT EXISTS "isInclusive" BOOLEAN        NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "glAccountId" TEXT;

DO $$ BEGIN
  ALTER TABLE tax_codes
    ADD CONSTRAINT "tax_codes_glAccountId_fkey"
      FOREIGN KEY ("glAccountId") REFERENCES accounts(id);
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

-- ─── 3. exchange_rates: rateType column ───────────────────────────────────────

ALTER TABLE exchange_rates
  ADD COLUMN IF NOT EXISTS "rateType" "ExchangeRateType" NOT NULL DEFAULT 'SPOT';

-- ─── 4. vat_returns table ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vat_returns (
  "id"                 TEXT          NOT NULL,
  "organisationId"     TEXT          NOT NULL,
  "periodStart"        DATE          NOT NULL,
  "periodEnd"          DATE          NOT NULL,
  "status"             "VatReturnStatus" NOT NULL DEFAULT 'DRAFT',
  "box1OutputTax"      DECIMAL(20,4) NOT NULL DEFAULT 0,
  "box2AcquisitionTax" DECIMAL(20,4) NOT NULL DEFAULT 0,
  "box3TotalOutput"    DECIMAL(20,4) NOT NULL DEFAULT 0,
  "box4InputTax"       DECIMAL(20,4) NOT NULL DEFAULT 0,
  "box5NetVat"         DECIMAL(20,4) NOT NULL DEFAULT 0,
  "box6TotalSupplies"  DECIMAL(20,4) NOT NULL DEFAULT 0,
  "box7TotalPurchases" DECIMAL(20,4) NOT NULL DEFAULT 0,
  "generatedBy"        TEXT,
  "submittedAt"        TIMESTAMP(3),
  "notes"              TEXT,
  "createdAt"          TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vat_returns_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE vat_returns
    ADD CONSTRAINT "vat_returns_organisationId_fkey"
      FOREIGN KEY ("organisationId") REFERENCES organisations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

CREATE INDEX IF NOT EXISTS "vat_returns_organisationId_periodStart_idx"
  ON vat_returns("organisationId", "periodStart");

-- ─── 5. vat_return_lines table ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vat_return_lines (
  "id"            TEXT          NOT NULL,
  "vatReturnId"   TEXT          NOT NULL,
  "boxNumber"     INTEGER       NOT NULL,
  "journalLineId" TEXT,
  "netAmount"     DECIMAL(20,4) NOT NULL,
  "taxAmount"     DECIMAL(20,4) NOT NULL,
  "taxCode"       TEXT,
  "description"   TEXT,
  "entryDate"     DATE          NOT NULL,
  "reference"     TEXT,
  CONSTRAINT "vat_return_lines_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE vat_return_lines
    ADD CONSTRAINT "vat_return_lines_vatReturnId_fkey"
      FOREIGN KEY ("vatReturnId") REFERENCES vat_returns(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN
  ALTER TABLE vat_return_lines
    ADD CONSTRAINT "vat_return_lines_journalLineId_fkey"
      FOREIGN KEY ("journalLineId") REFERENCES journal_lines(id);
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

CREATE INDEX IF NOT EXISTS "vat_return_lines_vatReturnId_idx"
  ON vat_return_lines("vatReturnId");

-- ─── 6. fx_revaluations table ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fx_revaluations (
  "id"                     TEXT                  NOT NULL,
  "organisationId"         TEXT                  NOT NULL,
  "periodEndDate"          DATE                  NOT NULL,
  "status"                 "FxRevaluationStatus" NOT NULL DEFAULT 'POSTED',
  "journalEntryId"         TEXT,
  "reversalJournalEntryId" TEXT,
  "generatedBy"            TEXT,
  "notes"                  TEXT,
  "createdAt"              TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fx_revaluations_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE fx_revaluations
    ADD CONSTRAINT "fx_revaluations_organisationId_fkey"
      FOREIGN KEY ("organisationId") REFERENCES organisations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

CREATE INDEX IF NOT EXISTS "fx_revaluations_organisationId_periodEndDate_idx"
  ON fx_revaluations("organisationId", "periodEndDate");

-- ─── 7. fx_revaluation_lines table ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fx_revaluation_lines (
  "id"             TEXT          NOT NULL,
  "revaluationId"  TEXT          NOT NULL,
  "accountId"      TEXT          NOT NULL,
  "currency"       TEXT          NOT NULL,
  "openingBalance" DECIMAL(20,4) NOT NULL,
  "originalRate"   DECIMAL(20,6) NOT NULL,
  "closingRate"    DECIMAL(20,6) NOT NULL,
  "baseBefore"     DECIMAL(20,4) NOT NULL,
  "baseAfter"      DECIMAL(20,4) NOT NULL,
  "gainLoss"       DECIMAL(20,4) NOT NULL,
  CONSTRAINT "fx_revaluation_lines_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE fx_revaluation_lines
    ADD CONSTRAINT "fx_revaluation_lines_revaluationId_fkey"
      FOREIGN KEY ("revaluationId") REFERENCES fx_revaluations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN
  ALTER TABLE fx_revaluation_lines
    ADD CONSTRAINT "fx_revaluation_lines_accountId_fkey"
      FOREIGN KEY ("accountId") REFERENCES accounts(id);
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

CREATE INDEX IF NOT EXISTS "fx_revaluation_lines_revaluationId_idx"
  ON fx_revaluation_lines("revaluationId");

COMMIT;
