-- ============================================================
-- Fixed Assets Enhancements Migration (IAS 16/36 Features 1-4)
-- Run in Neon SQL Editor after fixed_assets_migration.sql
-- ============================================================

-- 1. Revaluation surplus tracking on fixed assets (Feature 4 — IAS 16.41)
ALTER TABLE fixed_assets
  ADD COLUMN IF NOT EXISTS revaluation_surplus_remaining DECIMAL(20, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revaluation_reserve_account_id UUID NULL;

-- 2. Retained earnings account on asset categories (Feature 4 — IAS 16.41)
ALTER TABLE asset_categories
  ADD COLUMN IF NOT EXISTS retained_earnings_account_id UUID NULL;

-- 3. Impairment reversal audit table (Feature 3 — IAS 36.111)
CREATE TABLE IF NOT EXISTS asset_impairment_reversals (
  id                       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id          UUID          NOT NULL REFERENCES organisations(id),
  asset_id                 UUID          NOT NULL REFERENCES fixed_assets(id),
  reversal_date            DATE          NOT NULL,
  reversal_amount          DECIMAL(20,4) NOT NULL,
  previous_impairment_loss DECIMAL(20,4) NOT NULL,
  new_carrying_value       DECIMAL(20,4) NOT NULL,
  journal_entry_id         UUID          NULL REFERENCES journal_entries(id),
  notes                    TEXT          NULL,
  created_by               UUID          NOT NULL,
  created_at               TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asset_impairment_reversals_asset ON asset_impairment_reversals(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_impairment_reversals_org   ON asset_impairment_reversals(organisation_id);

-- Features 1 (proration) and 2 (depreciation schedule) are pure service-layer
-- changes — no additional columns needed.
