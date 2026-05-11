-- Loan Module: Incremental Migration
-- Idempotent — safe to run more than once
-- Run this in the Neon SQL Editor

BEGIN;

-- ─── 1. LoanStatus enum ───────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "LoanStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED', 'SUSPENDED');
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

-- ─── 2. employee_loans table ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS employee_loans (
  "id"               TEXT          NOT NULL,
  "organisationId"   TEXT          NOT NULL,
  "employeeId"       TEXT          NOT NULL,
  "description"      TEXT          NOT NULL,
  "principalAmount"  DECIMAL(20,4) NOT NULL,
  "balance"          DECIMAL(20,4) NOT NULL,
  "instalmentAmount" DECIMAL(20,4) NOT NULL,
  "startDate"        DATE          NOT NULL,
  "glAccountId"      TEXT,
  "status"           "LoanStatus"  NOT NULL DEFAULT 'ACTIVE',
  "createdBy"        TEXT          NOT NULL,
  "createdAt"        TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "employee_loans_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE employee_loans ADD CONSTRAINT "employee_loans_organisationId_fkey"
    FOREIGN KEY ("organisationId") REFERENCES organisations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN
  ALTER TABLE employee_loans ADD CONSTRAINT "employee_loans_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES employees(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN
  ALTER TABLE employee_loans ADD CONSTRAINT "employee_loans_glAccountId_fkey"
    FOREIGN KEY ("glAccountId") REFERENCES accounts(id);
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

CREATE INDEX IF NOT EXISTS "employee_loans_organisationId_idx" ON employee_loans("organisationId");
CREATE INDEX IF NOT EXISTS "employee_loans_employeeId_idx"     ON employee_loans("employeeId");

-- ─── 3. loanId column on payslip_lines ───────────────────────────────────────

ALTER TABLE payslip_lines
  ADD COLUMN IF NOT EXISTS "loanId" TEXT;

DO $$ BEGIN
  ALTER TABLE payslip_lines ADD CONSTRAINT "payslip_lines_loanId_fkey"
    FOREIGN KEY ("loanId") REFERENCES employee_loans(id);
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

COMMIT;
