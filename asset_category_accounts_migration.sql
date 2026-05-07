-- ============================================================
-- Asset Category GL Accounts Migration
-- Apply in Neon SQL Editor
-- ============================================================

-- Add GL account fields to asset_categories
ALTER TABLE asset_categories
  ADD COLUMN IF NOT EXISTS "assetCostAccountId"                TEXT,
  ADD COLUMN IF NOT EXISTS "depreciationExpenseAccountId"      TEXT,
  ADD COLUMN IF NOT EXISTS "accumulatedDepreciationAccountId"  TEXT;
