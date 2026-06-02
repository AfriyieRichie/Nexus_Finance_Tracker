-- ============================================================
-- Payroll Enhancements Migration
-- Run in Neon SQL Editor
-- ============================================================

-- Add locked_by / locked_at to payroll_runs for PAID → LOCKED workflow
ALTER TABLE payroll_runs
  ADD COLUMN IF NOT EXISTS locked_by  UUID NULL,
  ADD COLUMN IF NOT EXISTS locked_at  TIMESTAMPTZ NULL;
