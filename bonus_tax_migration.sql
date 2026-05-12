-- Bonus Tax: Incremental Migration
-- Idempotent — safe to run more than once
-- Run this in the Neon SQL Editor

BEGIN;

ALTER TABLE payslips
  ADD COLUMN IF NOT EXISTS "bonusTax" DECIMAL(20,4) NOT NULL DEFAULT 0;

COMMIT;
