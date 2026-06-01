-- ============================================================
-- Inventory Enhancements Migration (IAS 2 Features)
-- Run in Neon SQL Editor after the base inventory migration
-- ============================================================

-- Purchase Price Variance account for Standard Cost items (IAS 2)
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS purchase_price_variance_account_id UUID NULL;
