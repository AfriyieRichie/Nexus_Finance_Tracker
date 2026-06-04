-- ============================================================
-- Add supplier-link columns to fixed_assets for "acquired on credit" purchases.
-- When an asset is bought on credit, a supplier invoice (AP payable) is raised
-- and the asset records which supplier + invoice it came from. camelCase TEXT to
-- match the Prisma schema. Idempotent.
-- ============================================================

ALTER TABLE fixed_assets ADD COLUMN IF NOT EXISTS "acquisitionSupplierId"        TEXT;
ALTER TABLE fixed_assets ADD COLUMN IF NOT EXISTS "acquisitionSupplierInvoiceId" TEXT;
