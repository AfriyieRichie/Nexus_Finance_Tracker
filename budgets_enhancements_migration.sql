-- ============================================================
-- Budgets Enhancements Migration
-- Run in Neon SQL Editor
-- ============================================================

-- Add description field to budgets (manual section 13.4)
ALTER TABLE budgets
  ADD COLUMN IF NOT EXISTS description TEXT NULL;
