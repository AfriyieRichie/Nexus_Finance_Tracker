-- Overtime Configuration: Incremental Migration
-- Idempotent — safe to run more than once
-- Run this in the Neon SQL Editor

BEGIN;

-- ─── New columns on employees ─────────────────────────────────────────────────

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS "overtimeType"        TEXT          NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS "overtimeFixedAmount"  DECIMAL(20,4),
  ADD COLUMN IF NOT EXISTS "overtimeMultiplier"   DECIMAL(5,2);

-- ─── New column on payslip_lines (overtimeHours trace) ───────────────────────
-- Not needed at DB level — hours are an input; computed amount is stored in payslip lines.

COMMIT;
