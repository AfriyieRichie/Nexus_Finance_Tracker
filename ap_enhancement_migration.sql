-- ============================================================
-- AP Enhancement Migration
-- Run in Neon SQL Editor (or any Postgres client)
-- ============================================================

-- 1. WHT fields on suppliers
ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS wht_rate          DECIMAL(5,2)  NULL,
  ADD COLUMN IF NOT EXISTS wht_classification VARCHAR(100)  NULL;

-- 2. SupplierPayment table
CREATE TABLE IF NOT EXISTS supplier_payments (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id     UUID          NOT NULL REFERENCES organisations(id),
  supplier_invoice_id UUID          NOT NULL REFERENCES supplier_invoices(id),
  supplier_id         UUID          NOT NULL REFERENCES suppliers(id),
  payment_date        DATE          NOT NULL,
  amount              DECIMAL(20,4) NOT NULL,
  wht_amount          DECIMAL(20,4) NOT NULL DEFAULT 0,
  wht_rate            DECIMAL(5,2)  NULL,
  reference           TEXT          NULL,
  bank_account_id     UUID          NOT NULL,
  period_id           UUID          NOT NULL REFERENCES accounting_periods(id),
  journal_entry_id    UUID          NULL REFERENCES journal_entries(id),
  is_reversed         BOOLEAN       NOT NULL DEFAULT FALSE,
  reversed_at         TIMESTAMPTZ   NULL,
  reversed_by         UUID          NULL,
  reversal_reason     TEXT          NULL,
  reversal_journal_id UUID          NULL REFERENCES journal_entries(id),
  created_by          UUID          NOT NULL,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_payments_org     ON supplier_payments(organisation_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_invoice ON supplier_payments(supplier_invoice_id);

-- 3. SupplierCreditNote table
CREATE TABLE IF NOT EXISTS supplier_credit_notes (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id     UUID          NOT NULL REFERENCES organisations(id),
  supplier_id         UUID          NOT NULL REFERENCES suppliers(id),
  supplier_invoice_id UUID          NULL REFERENCES supplier_invoices(id),
  credit_note_number  VARCHAR(50)   NOT NULL,
  credit_note_date    DATE          NOT NULL,
  amount              DECIMAL(20,4) NOT NULL,
  tax_amount          DECIMAL(20,4) NOT NULL DEFAULT 0,
  reason              TEXT          NULL,
  currency            CHAR(3)       NOT NULL DEFAULT 'GHS',
  exchange_rate       DECIMAL(20,6) NOT NULL DEFAULT 1,
  journal_entry_id    UUID          NULL REFERENCES journal_entries(id),
  created_by          UUID          NOT NULL,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_credit_notes_org      ON supplier_credit_notes(organisation_id);
CREATE INDEX IF NOT EXISTS idx_supplier_credit_notes_supplier ON supplier_credit_notes(supplier_id);

-- 4. Ensure SUPPLIER_INVOICE exists in the approval_entity_type enum
-- (Postgres enums require a specific command; skip if already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'approval_entity_type'::regtype
      AND enumlabel = 'SUPPLIER_INVOICE'
  ) THEN
    ALTER TYPE approval_entity_type ADD VALUE 'SUPPLIER_INVOICE';
  END IF;
END$$;

-- 5. WHT Payable accounts — add to existing organisations that don't have one
-- This is a best-effort insert. Adjust the parent_id to suit your COA structure.
-- If you have a specific "Tax Liabilities" parent account, replace the subquery below.
--
-- INSERT INTO accounts (id, organisation_id, code, name, type, class, is_active, is_deleted, is_control_account, created_at, updated_at)
-- SELECT
--   gen_random_uuid(),
--   o.id,
--   '213200',
--   'WHT Payable',
--   'TAX_PAYABLE',
--   'LIABILITY',
--   TRUE,
--   FALSE,
--   FALSE,
--   now(),
--   now()
-- FROM organisations o
-- WHERE NOT EXISTS (
--   SELECT 1 FROM accounts a
--   WHERE a.organisation_id = o.id
--     AND a.type = 'TAX_PAYABLE'
--     AND (a.name ILIKE '%wht%' OR a.name ILIKE '%withhold%')
--     AND a.is_deleted = FALSE
-- );
--
-- IMPORTANT: Uncomment and run the above INSERT if your organisation does not
-- already have a WHT Payable account, then refresh the page to see it in the COA.
