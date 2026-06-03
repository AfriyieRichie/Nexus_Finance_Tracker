-- ============================================================
-- Fix: align column TYPES to the Prisma schema (the source of truth).
-- These columns drifted from the schema because hand-written migrations created
-- them as uuid/varchar/timestamptz, while Prisma maps the fields to TEXT/DATE.
--
--   * account / user id columns created as uuid -> TEXT (matches accounts.id and
--     every other id column; removes a latent uuid-vs-text FK landmine).
--   * suppliers.whtClassification varchar -> TEXT.
--   * approval_delegations.validFrom/validTo timestamptz -> DATE (@db.Date).
--
-- Conversions preserve data (uuid/varchar cast cleanly to text; timestamptz casts
-- to date by dropping the time component). Idempotent: re-running a TYPE change to
-- the same type is a no-op. System-wide. Run in Neon SQL Editor / prisma db execute.
-- ============================================================

ALTER TABLE fixed_assets        ALTER COLUMN "revaluationReserveAccountId"     TYPE TEXT USING "revaluationReserveAccountId"::text;
ALTER TABLE asset_categories    ALTER COLUMN "retainedEarningsAccountId"       TYPE TEXT USING "retainedEarningsAccountId"::text;
ALTER TABLE inventory_items     ALTER COLUMN "purchasePriceVarianceAccountId"  TYPE TEXT USING "purchasePriceVarianceAccountId"::text;
ALTER TABLE payroll_runs        ALTER COLUMN "lockedBy"                        TYPE TEXT USING "lockedBy"::text;
ALTER TABLE suppliers           ALTER COLUMN "whtClassification"               TYPE TEXT USING "whtClassification"::text;
ALTER TABLE approval_delegations ALTER COLUMN "validFrom" TYPE DATE USING "validFrom"::date;
ALTER TABLE approval_delegations ALTER COLUMN "validTo"   TYPE DATE USING "validTo"::date;
