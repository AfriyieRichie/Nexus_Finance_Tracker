-- ============================================================
-- Fix: create 3 tables that the hand-written migrations created with the
-- wrong convention (snake_case + UUID). These match the Prisma schema exactly
-- (camelCase + TEXT), like the rest of the database. Idempotent.
--   supersedes the table-creation parts of:
--     ap_enhancement_migration.sql, fixed_assets_enhancements_migration.sql
-- Run in Neon SQL Editor (or via prisma db execute).
-- ============================================================

-- ─── supplier_payments ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS supplier_payments (
  "id"                TEXT          NOT NULL,
  "organisationId"    TEXT          NOT NULL,
  "supplierInvoiceId" TEXT          NOT NULL,
  "supplierId"        TEXT          NOT NULL,
  "paymentDate"       DATE          NOT NULL,
  "amount"            DECIMAL(20,4) NOT NULL,
  "whtAmount"         DECIMAL(20,4) NOT NULL DEFAULT 0,
  "whtRate"           DECIMAL(5,2),
  "reference"         TEXT,
  "bankAccountId"     TEXT          NOT NULL,
  "periodId"          TEXT          NOT NULL,
  "journalEntryId"    TEXT,
  "isReversed"        BOOLEAN       NOT NULL DEFAULT false,
  "reversedAt"        TIMESTAMP(3),
  "reversedBy"        TEXT,
  "reversalReason"    TEXT,
  "reversalJournalId" TEXT,
  "createdBy"         TEXT          NOT NULL,
  "createdAt"         TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);
DO $$ BEGIN ALTER TABLE supplier_payments ADD CONSTRAINT "supplier_payments_organisationId_fkey"    FOREIGN KEY ("organisationId")    REFERENCES organisations(id);     EXCEPTION WHEN duplicate_object THEN NULL; END; $$;
DO $$ BEGIN ALTER TABLE supplier_payments ADD CONSTRAINT "supplier_payments_supplierInvoiceId_fkey" FOREIGN KEY ("supplierInvoiceId") REFERENCES supplier_invoices(id); EXCEPTION WHEN duplicate_object THEN NULL; END; $$;
DO $$ BEGIN ALTER TABLE supplier_payments ADD CONSTRAINT "supplier_payments_supplierId_fkey"        FOREIGN KEY ("supplierId")        REFERENCES suppliers(id);         EXCEPTION WHEN duplicate_object THEN NULL; END; $$;
CREATE INDEX IF NOT EXISTS "supplier_payments_organisationId_idx"    ON supplier_payments("organisationId");
CREATE INDEX IF NOT EXISTS "supplier_payments_supplierInvoiceId_idx" ON supplier_payments("supplierInvoiceId");

-- ─── supplier_credit_notes ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS supplier_credit_notes (
  "id"                TEXT          NOT NULL,
  "organisationId"    TEXT          NOT NULL,
  "supplierId"        TEXT          NOT NULL,
  "supplierInvoiceId" TEXT,
  "creditNoteNumber"  TEXT          NOT NULL,
  "creditNoteDate"    DATE          NOT NULL,
  "amount"            DECIMAL(20,4) NOT NULL,
  "taxAmount"         DECIMAL(20,4) NOT NULL DEFAULT 0,
  "reason"            TEXT,
  "currency"          TEXT          NOT NULL DEFAULT 'GHS',
  "exchangeRate"      DECIMAL(20,6) NOT NULL DEFAULT 1,
  "journalEntryId"    TEXT,
  "createdBy"         TEXT          NOT NULL,
  "createdAt"         TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_credit_notes_pkey" PRIMARY KEY ("id")
);
DO $$ BEGIN ALTER TABLE supplier_credit_notes ADD CONSTRAINT "supplier_credit_notes_organisationId_fkey"    FOREIGN KEY ("organisationId")    REFERENCES organisations(id);     EXCEPTION WHEN duplicate_object THEN NULL; END; $$;
DO $$ BEGIN ALTER TABLE supplier_credit_notes ADD CONSTRAINT "supplier_credit_notes_supplierId_fkey"        FOREIGN KEY ("supplierId")        REFERENCES suppliers(id);         EXCEPTION WHEN duplicate_object THEN NULL; END; $$;
DO $$ BEGIN ALTER TABLE supplier_credit_notes ADD CONSTRAINT "supplier_credit_notes_supplierInvoiceId_fkey" FOREIGN KEY ("supplierInvoiceId") REFERENCES supplier_invoices(id); EXCEPTION WHEN duplicate_object THEN NULL; END; $$;
CREATE INDEX IF NOT EXISTS "supplier_credit_notes_organisationId_idx" ON supplier_credit_notes("organisationId");
CREATE INDEX IF NOT EXISTS "supplier_credit_notes_supplierId_idx"     ON supplier_credit_notes("supplierId");

-- ─── asset_impairment_reversals ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_impairment_reversals (
  "id"                     TEXT          NOT NULL,
  "organisationId"         TEXT          NOT NULL,
  "assetId"                TEXT          NOT NULL,
  "reversalDate"           DATE          NOT NULL,
  "reversalAmount"         DECIMAL(20,4) NOT NULL,
  "previousImpairmentLoss" DECIMAL(20,4) NOT NULL,
  "newCarryingValue"       DECIMAL(20,4) NOT NULL,
  "journalEntryId"         TEXT,
  "notes"                  TEXT,
  "createdBy"              TEXT          NOT NULL,
  "createdAt"              TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "asset_impairment_reversals_pkey" PRIMARY KEY ("id")
);
DO $$ BEGIN ALTER TABLE asset_impairment_reversals ADD CONSTRAINT "asset_impairment_reversals_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES organisations(id); EXCEPTION WHEN duplicate_object THEN NULL; END; $$;
DO $$ BEGIN ALTER TABLE asset_impairment_reversals ADD CONSTRAINT "asset_impairment_reversals_assetId_fkey"        FOREIGN KEY ("assetId")        REFERENCES fixed_assets(id);  EXCEPTION WHEN duplicate_object THEN NULL; END; $$;
CREATE INDEX IF NOT EXISTS "asset_impairment_reversals_assetId_idx"        ON asset_impairment_reversals("assetId");
CREATE INDEX IF NOT EXISTS "asset_impairment_reversals_organisationId_idx" ON asset_impairment_reversals("organisationId");
