-- ============================================================
-- Fixed Assets Enhancement Migration
-- Run in Neon SQL Editor (or any Postgres client)
-- ============================================================

-- 1. Gain/Loss on Disposal GL account on asset categories
ALTER TABLE asset_categories
  ADD COLUMN IF NOT EXISTS gain_loss_on_disposal_account_id UUID NULL;

-- 2. User-defined reducing balance rate on fixed assets
--    Stored as an annual rate (e.g. 0.25 = 25 %).
--    When NULL, the system defaults to double-declining: 2 / useful_life_months.
ALTER TABLE fixed_assets
  ADD COLUMN IF NOT EXISTS reducing_balance_rate DECIMAL(8, 6) NULL;
