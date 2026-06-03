-- ============================================================
-- Fix: several hand-written feature migrations added columns using the
-- snake_case + UUID convention, but Prisma maps every field to a quoted
-- camelCase TEXT column. The result was snake_case columns the ORM cannot
-- read — `prisma.fixedAsset/inventoryItem/...findMany()` failed at runtime
-- with "column ... does not exist", silently breaking those modules.
--
-- This is a SYSTEM-WIDE structural fix: these are shared tables, so the
-- rename corrects the column for every organisation at once (current and
-- future). There is no per-org data involved — only the table structure.
--
-- Renames preserve any existing data; columns that were never created at all
-- are added. Idempotent — safe to re-run.
--   supersedes the ADD COLUMN parts of:
--     ap_enhancement_migration.sql, fixed_assets_enhancements_migration.sql,
--     and the snake_case columns in the inventory / payroll / supplier WHT work.
-- Run in Neon SQL Editor (or via prisma db execute).
-- ============================================================

-- ─── helper: rename a column only if the old (snake) name exists and the new
--     (camel) name does not yet — keeps this script idempotent. ───────────────
CREATE OR REPLACE FUNCTION _rename_col(tbl text, old_name text, new_name text)
RETURNS void AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = tbl AND column_name = old_name)
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = tbl AND column_name = new_name)
  THEN
    EXECUTE format('ALTER TABLE %I RENAME COLUMN %I TO %I', tbl, old_name, new_name);
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ─── fixed_assets ────────────────────────────────────────────────────────────
SELECT _rename_col('fixed_assets', 'revaluation_reserve_account_id', 'revaluationReserveAccountId');
SELECT _rename_col('fixed_assets', 'revaluation_surplus_remaining', 'revaluationSurplusRemaining');
ALTER TABLE fixed_assets ADD COLUMN IF NOT EXISTS "reducingBalanceRate" DECIMAL(8,6);
-- ensure the (renamed) surplus column has the NOT NULL DEFAULT 0 the schema requires
ALTER TABLE fixed_assets ALTER COLUMN "revaluationSurplusRemaining" SET DEFAULT 0;
UPDATE fixed_assets SET "revaluationSurplusRemaining" = 0 WHERE "revaluationSurplusRemaining" IS NULL;
ALTER TABLE fixed_assets ALTER COLUMN "revaluationSurplusRemaining" SET NOT NULL;

-- ─── asset_categories ────────────────────────────────────────────────────────
SELECT _rename_col('asset_categories', 'retained_earnings_account_id', 'retainedEarningsAccountId');
ALTER TABLE asset_categories ADD COLUMN IF NOT EXISTS "gainLossOnDisposalAccountId" TEXT;

-- ─── inventory_items ─────────────────────────────────────────────────────────
SELECT _rename_col('inventory_items', 'purchase_price_variance_account_id', 'purchasePriceVarianceAccountId');

-- ─── payroll_runs ────────────────────────────────────────────────────────────
SELECT _rename_col('payroll_runs', 'locked_at', 'lockedAt');
SELECT _rename_col('payroll_runs', 'locked_by', 'lockedBy');

-- ─── suppliers (withholding tax) ─────────────────────────────────────────────
SELECT _rename_col('suppliers', 'wht_classification', 'whtClassification');
SELECT _rename_col('suppliers', 'wht_rate', 'whtRate');

-- ─── organisations ───────────────────────────────────────────────────────────
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS "vatRegistrationNo" TEXT;

-- ─── cleanup ─────────────────────────────────────────────────────────────────
DROP FUNCTION _rename_col(text, text, text);
