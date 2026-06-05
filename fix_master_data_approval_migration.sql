-- Master-data governance: approval status on suppliers/customers + staged change
-- payload on approval requests. Existing rows default to APPROVED (already live).

DO $$ BEGIN
  CREATE TYPE "MasterDataStatus" AS ENUM ('APPROVED', 'PENDING_APPROVAL', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Add SUPPLIER and CUSTOMER to the approval entity-type enum (idempotent).
ALTER TYPE "ApprovalEntityType" ADD VALUE IF NOT EXISTS 'SUPPLIER';
ALTER TYPE "ApprovalEntityType" ADD VALUE IF NOT EXISTS 'CUSTOMER';

ALTER TABLE approval_requests ADD COLUMN IF NOT EXISTS "changeType" TEXT;
ALTER TABLE approval_requests ADD COLUMN IF NOT EXISTS "payload" JSONB;

ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS "approvalStatus" "MasterDataStatus" NOT NULL DEFAULT 'APPROVED';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS "approvalStatus" "MasterDataStatus" NOT NULL DEFAULT 'APPROVED';
