-- ============================================================
-- Enable document attachments: tenant scoping + in-database file storage.
-- Adds organisationId (scope) and a bytea `data` column (file bytes) to the
-- existing attachments table. camelCase TEXT to match Prisma. Idempotent.
-- ============================================================

ALTER TABLE attachments ADD COLUMN IF NOT EXISTS "organisationId" TEXT;
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS "data" BYTEA;
CREATE INDEX IF NOT EXISTS "attachments_organisationId_idx" ON attachments("organisationId");
