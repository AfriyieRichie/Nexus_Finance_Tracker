-- Procure-to-pay: Purchase Orders and Payment Vouchers.
DO $$ BEGIN
  CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT','PENDING_APPROVAL','APPROVED','PARTIALLY_BILLED','BILLED','CLOSED','CANCELLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE TYPE "PaymentVoucherStatus" AS ENUM ('DRAFT','PENDING_APPROVAL','APPROVED','PAID','CANCELLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS purchase_orders (
  id              TEXT PRIMARY KEY,
  "organisationId" TEXT NOT NULL REFERENCES organisations(id),
  "poNumber"      TEXT NOT NULL,
  "supplierId"    TEXT NOT NULL REFERENCES suppliers(id),
  "orderDate"     DATE NOT NULL,
  "expectedDate"  DATE,
  currency        TEXT NOT NULL,
  "exchangeRate"  DECIMAL(20,6) NOT NULL DEFAULT 1,
  status          "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
  subtotal        DECIMAL(20,4) NOT NULL,
  "taxAmount"     DECIMAL(20,4) NOT NULL DEFAULT 0,
  "totalAmount"   DECIMAL(20,4) NOT NULL,
  notes           TEXT,
  "createdBy"     TEXT NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "purchase_orders_organisationId_poNumber_key" ON purchase_orders("organisationId","poNumber");
CREATE INDEX IF NOT EXISTS "purchase_orders_organisationId_status_idx" ON purchase_orders("organisationId",status);
CREATE INDEX IF NOT EXISTS "purchase_orders_supplierId_idx" ON purchase_orders("supplierId");

CREATE TABLE IF NOT EXISTS purchase_order_lines (
  id                TEXT PRIMARY KEY,
  "purchaseOrderId" TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  "lineNumber"      INTEGER NOT NULL,
  description       TEXT NOT NULL,
  quantity          DECIMAL(20,4) NOT NULL,
  "unitPrice"       DECIMAL(20,4) NOT NULL,
  "accountId"       TEXT,
  "taxCode"         TEXT,
  "taxAmount"       DECIMAL(20,4) NOT NULL DEFAULT 0,
  "lineTotal"       DECIMAL(20,4) NOT NULL,
  "quantityReceived" DECIMAL(20,4) NOT NULL DEFAULT 0,
  "quantityBilled"  DECIMAL(20,4) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS "purchase_order_lines_purchaseOrderId_idx" ON purchase_order_lines("purchaseOrderId");

CREATE TABLE IF NOT EXISTS payment_vouchers (
  id              TEXT PRIMARY KEY,
  "organisationId" TEXT NOT NULL REFERENCES organisations(id),
  "pvNumber"      TEXT NOT NULL,
  "supplierId"    TEXT NOT NULL REFERENCES suppliers(id),
  "voucherDate"   DATE NOT NULL,
  "bankAccountId" TEXT,
  currency        TEXT NOT NULL,
  status          "PaymentVoucherStatus" NOT NULL DEFAULT 'DRAFT',
  "totalAmount"   DECIMAL(20,4) NOT NULL,
  "payeeMemo"     TEXT,
  notes           TEXT,
  "createdBy"     TEXT NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "payment_vouchers_organisationId_pvNumber_key" ON payment_vouchers("organisationId","pvNumber");
CREATE INDEX IF NOT EXISTS "payment_vouchers_organisationId_status_idx" ON payment_vouchers("organisationId",status);
CREATE INDEX IF NOT EXISTS "payment_vouchers_supplierId_idx" ON payment_vouchers("supplierId");

CREATE TABLE IF NOT EXISTS payment_voucher_lines (
  id                 TEXT PRIMARY KEY,
  "paymentVoucherId" TEXT NOT NULL REFERENCES payment_vouchers(id) ON DELETE CASCADE,
  "supplierInvoiceId" TEXT NOT NULL REFERENCES supplier_invoices(id),
  amount             DECIMAL(20,4) NOT NULL
);
CREATE INDEX IF NOT EXISTS "payment_voucher_lines_paymentVoucherId_idx" ON payment_voucher_lines("paymentVoucherId");

ALTER TABLE supplier_invoices ADD COLUMN IF NOT EXISTS "purchaseOrderId" TEXT;
