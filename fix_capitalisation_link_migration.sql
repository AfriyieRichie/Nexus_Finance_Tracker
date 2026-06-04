-- ============================================================
-- Asset capitalisation-from-clearing: link a supplier-invoice line (coded to the
-- Fixed Asset Clearing account) to the fixed asset it was capitalised into.
-- null = pending capitalisation. camelCase TEXT to match Prisma. Idempotent.
-- ============================================================
ALTER TABLE supplier_invoice_lines ADD COLUMN IF NOT EXISTS "capitalisedAssetId" TEXT;
CREATE INDEX IF NOT EXISTS "supplier_invoice_lines_capitalisedAssetId_idx" ON supplier_invoice_lines("capitalisedAssetId");
