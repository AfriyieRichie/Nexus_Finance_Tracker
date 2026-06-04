-- Persist the chosen AP control/detail account on each supplier invoice so posting
-- credits the account the user selected instead of an arbitrary PAYABLE account.
ALTER TABLE supplier_invoices ADD COLUMN IF NOT EXISTS "apAccountId" TEXT;
