-- ============================================================
-- Audit Trail Enhancement Migration
-- Apply in Neon SQL Editor
-- ============================================================

-- Add module, entityRef, description columns to audit_logs
ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS module      TEXT,
  ADD COLUMN IF NOT EXISTS "entityRef" TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT;

-- Index for module-scoped queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_module
  ON audit_logs (module)
  WHERE module IS NOT NULL;
