-- Payroll Module: Incremental Migration
-- Idempotent — safe to run more than once
-- Run this in the Neon SQL Editor

BEGIN;

-- ─── 1. New enums ─────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'CASUAL');
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN
  CREATE TYPE "PayFrequency" AS ENUM ('MONTHLY', 'FORTNIGHTLY', 'WEEKLY');
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN
  CREATE TYPE "SalaryComponentType" AS ENUM (
    'BASIC_SALARY', 'OVERTIME', 'BONUS', 'COMMISSION',
    'ALLOWANCE', 'OTHER_EARNING', 'EMPLOYEE_DEDUCTION', 'EMPLOYER_CONTRIBUTION'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN
  CREATE TYPE "PayrollRunStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'PAID', 'LOCKED');
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN
  CREATE TYPE "PayslipStatus" AS ENUM ('DRAFT', 'FINALISED', 'PAID');
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

-- ─── 2. payroll_statutory_configs ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payroll_statutory_configs (
  "id"                TEXT          NOT NULL,
  "organisationId"    TEXT          NOT NULL,
  "taxYear"           INTEGER       NOT NULL,
  "ssnitEmployeeRate" DECIMAL(6,4)  NOT NULL DEFAULT 0.055,
  "ssnitEmployerRate" DECIMAL(6,4)  NOT NULL DEFAULT 0.13,
  "tier2Rate"         DECIMAL(6,4)  NOT NULL DEFAULT 0.05,
  "payeBands"         JSONB         NOT NULL DEFAULT '[]',
  "personalRelief"    DECIMAL(20,4) NOT NULL DEFAULT 0,
  "createdAt"         TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_statutory_configs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payroll_statutory_configs_organisationId_taxYear_key" UNIQUE ("organisationId", "taxYear")
);

DO $$ BEGIN
  ALTER TABLE payroll_statutory_configs
    ADD CONSTRAINT "payroll_statutory_configs_organisationId_fkey"
      FOREIGN KEY ("organisationId") REFERENCES organisations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

CREATE INDEX IF NOT EXISTS "payroll_statutory_configs_organisationId_idx"
  ON payroll_statutory_configs("organisationId");

-- ─── 3. employees ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS employees (
  "id"                     TEXT            NOT NULL,
  "organisationId"         TEXT            NOT NULL,
  "employeeNumber"         TEXT            NOT NULL,
  "firstName"              TEXT            NOT NULL,
  "lastName"               TEXT            NOT NULL,
  "email"                  TEXT,
  "phone"                  TEXT,
  "nationalId"             TEXT,
  "tinNumber"              TEXT,
  "ssnitNumber"            TEXT,
  "employmentType"         "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
  "payFrequency"           "PayFrequency"   NOT NULL DEFAULT 'MONTHLY',
  "startDate"              DATE            NOT NULL,
  "endDate"                DATE,
  "jobTitle"               TEXT,
  "departmentId"           TEXT,
  "costCentreId"           TEXT,
  "basicSalary"            DECIMAL(20,4)   NOT NULL,
  "bankName"               TEXT,
  "bankAccountNumber"      TEXT,
  "bankBranch"             TEXT,
  "tier3EmployeeRate"      DECIMAL(6,4),
  "tier3EmployerRate"      DECIMAL(6,4),
  "salaryExpenseAccountId" TEXT,
  "isActive"               BOOLEAN         NOT NULL DEFAULT true,
  "createdAt"              TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "employees_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "employees_organisationId_employeeNumber_key" UNIQUE ("organisationId", "employeeNumber")
);

DO $$ BEGIN
  ALTER TABLE employees ADD CONSTRAINT "employees_organisationId_fkey"
    FOREIGN KEY ("organisationId") REFERENCES organisations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN
  ALTER TABLE employees ADD CONSTRAINT "employees_departmentId_fkey"
    FOREIGN KEY ("departmentId") REFERENCES departments(id);
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN
  ALTER TABLE employees ADD CONSTRAINT "employees_costCentreId_fkey"
    FOREIGN KEY ("costCentreId") REFERENCES cost_centres(id);
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN
  ALTER TABLE employees ADD CONSTRAINT "employees_salaryExpenseAccountId_fkey"
    FOREIGN KEY ("salaryExpenseAccountId") REFERENCES accounts(id);
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

CREATE INDEX IF NOT EXISTS "employees_organisationId_isActive_idx"
  ON employees("organisationId", "isActive");

-- ─── 4. salary_components ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS salary_components (
  "id"             TEXT                  NOT NULL,
  "organisationId" TEXT                  NOT NULL,
  "code"           TEXT                  NOT NULL,
  "name"           TEXT                  NOT NULL,
  "type"           "SalaryComponentType" NOT NULL,
  "isTaxable"      BOOLEAN               NOT NULL DEFAULT true,
  "glAccountId"    TEXT,
  "description"    TEXT,
  "isActive"       BOOLEAN               NOT NULL DEFAULT true,
  "createdAt"      TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "salary_components_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "salary_components_organisationId_code_key" UNIQUE ("organisationId", "code")
);

DO $$ BEGIN
  ALTER TABLE salary_components ADD CONSTRAINT "salary_components_organisationId_fkey"
    FOREIGN KEY ("organisationId") REFERENCES organisations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN
  ALTER TABLE salary_components ADD CONSTRAINT "salary_components_glAccountId_fkey"
    FOREIGN KEY ("glAccountId") REFERENCES accounts(id);
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

CREATE INDEX IF NOT EXISTS "salary_components_organisationId_idx"
  ON salary_components("organisationId");

-- ─── 5. employee_components ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS employee_components (
  "id"            TEXT          NOT NULL,
  "employeeId"    TEXT          NOT NULL,
  "componentId"   TEXT          NOT NULL,
  "amount"        DECIMAL(20,4),
  "rate"          DECIMAL(8,6),
  "effectiveFrom" DATE          NOT NULL,
  "effectiveTo"   DATE,
  "isActive"      BOOLEAN       NOT NULL DEFAULT true,
  "createdAt"     TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "employee_components_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE employee_components ADD CONSTRAINT "employee_components_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES employees(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN
  ALTER TABLE employee_components ADD CONSTRAINT "employee_components_componentId_fkey"
    FOREIGN KEY ("componentId") REFERENCES salary_components(id);
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

CREATE INDEX IF NOT EXISTS "employee_components_employeeId_idx"
  ON employee_components("employeeId");

-- ─── 6. payroll_runs ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payroll_runs (
  "id"                      TEXT                NOT NULL,
  "organisationId"          TEXT                NOT NULL,
  "runNumber"               TEXT                NOT NULL,
  "periodId"                TEXT                NOT NULL,
  "paymentDate"             DATE                NOT NULL,
  "description"             TEXT                NOT NULL,
  "status"                  "PayrollRunStatus"  NOT NULL DEFAULT 'DRAFT',
  "isSupplementary"         BOOLEAN             NOT NULL DEFAULT false,
  "parentRunId"             TEXT,
  "wagesPayableAccountId"   TEXT                NOT NULL,
  "payePayableAccountId"    TEXT                NOT NULL,
  "ssnitPayableAccountId"   TEXT                NOT NULL,
  "pensionPayableAccountId" TEXT                NOT NULL,
  "totalGross"              DECIMAL(20,4)       NOT NULL DEFAULT 0,
  "totalPaye"               DECIMAL(20,4)       NOT NULL DEFAULT 0,
  "totalSsnitEmployee"      DECIMAL(20,4)       NOT NULL DEFAULT 0,
  "totalSsnitEmployer"      DECIMAL(20,4)       NOT NULL DEFAULT 0,
  "totalTier2"              DECIMAL(20,4)       NOT NULL DEFAULT 0,
  "totalTier3Employee"      DECIMAL(20,4)       NOT NULL DEFAULT 0,
  "totalTier3Employer"      DECIMAL(20,4)       NOT NULL DEFAULT 0,
  "totalOtherDeductions"    DECIMAL(20,4)       NOT NULL DEFAULT 0,
  "totalNetPay"             DECIMAL(20,4)       NOT NULL DEFAULT 0,
  "totalEmployerCost"       DECIMAL(20,4)       NOT NULL DEFAULT 0,
  "createdBy"               TEXT                NOT NULL,
  "submittedBy"             TEXT,
  "submittedAt"             TIMESTAMP(3),
  "approvedBy"              TEXT,
  "approvedAt"              TIMESTAMP(3),
  "paidBy"                  TEXT,
  "paidAt"                  TIMESTAMP(3),
  "journalEntryId"          TEXT,
  "notes"                   TEXT,
  "createdAt"               TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"               TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payroll_runs_organisationId_runNumber_key" UNIQUE ("organisationId", "runNumber")
);

DO $$ BEGIN
  ALTER TABLE payroll_runs ADD CONSTRAINT "payroll_runs_organisationId_fkey"
    FOREIGN KEY ("organisationId") REFERENCES organisations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN
  ALTER TABLE payroll_runs ADD CONSTRAINT "payroll_runs_periodId_fkey"
    FOREIGN KEY ("periodId") REFERENCES accounting_periods(id);
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN
  ALTER TABLE payroll_runs ADD CONSTRAINT "payroll_runs_parentRunId_fkey"
    FOREIGN KEY ("parentRunId") REFERENCES payroll_runs(id);
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

CREATE INDEX IF NOT EXISTS "payroll_runs_organisationId_status_idx"
  ON payroll_runs("organisationId", "status");
CREATE INDEX IF NOT EXISTS "payroll_runs_organisationId_periodId_idx"
  ON payroll_runs("organisationId", "periodId");

-- ─── 7. payslips ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payslips (
  "id"               TEXT             NOT NULL,
  "payrollRunId"     TEXT             NOT NULL,
  "employeeId"       TEXT             NOT NULL,
  "organisationId"   TEXT             NOT NULL,
  "status"           "PayslipStatus"  NOT NULL DEFAULT 'DRAFT',
  "basicSalary"      DECIMAL(20,4)    NOT NULL DEFAULT 0,
  "overtimePay"      DECIMAL(20,4)    NOT NULL DEFAULT 0,
  "bonuses"          DECIMAL(20,4)    NOT NULL DEFAULT 0,
  "allowances"       DECIMAL(20,4)    NOT NULL DEFAULT 0,
  "otherEarnings"    DECIMAL(20,4)    NOT NULL DEFAULT 0,
  "grossPay"         DECIMAL(20,4)    NOT NULL DEFAULT 0,
  "payeAmount"       DECIMAL(20,4)    NOT NULL DEFAULT 0,
  "ssnitEmployee"    DECIMAL(20,4)    NOT NULL DEFAULT 0,
  "tier3Employee"    DECIMAL(20,4)    NOT NULL DEFAULT 0,
  "otherDeductions"  DECIMAL(20,4)    NOT NULL DEFAULT 0,
  "totalDeductions"  DECIMAL(20,4)    NOT NULL DEFAULT 0,
  "netPay"           DECIMAL(20,4)    NOT NULL DEFAULT 0,
  "ssnitEmployer"    DECIMAL(20,4)    NOT NULL DEFAULT 0,
  "tier2Employer"    DECIMAL(20,4)    NOT NULL DEFAULT 0,
  "tier3Employer"    DECIMAL(20,4)    NOT NULL DEFAULT 0,
  "totalEmployerCost" DECIMAL(20,4)   NOT NULL DEFAULT 0,
  "ytdGross"         DECIMAL(20,4)    NOT NULL DEFAULT 0,
  "ytdPaye"          DECIMAL(20,4)    NOT NULL DEFAULT 0,
  "ytdSsnit"         DECIMAL(20,4)    NOT NULL DEFAULT 0,
  "ytdNetPay"        DECIMAL(20,4)    NOT NULL DEFAULT 0,
  "departmentId"     TEXT,
  "costCentreId"     TEXT,
  "createdAt"        TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payslips_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payslips_payrollRunId_employeeId_key" UNIQUE ("payrollRunId", "employeeId")
);

DO $$ BEGIN
  ALTER TABLE payslips ADD CONSTRAINT "payslips_payrollRunId_fkey"
    FOREIGN KEY ("payrollRunId") REFERENCES payroll_runs(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN
  ALTER TABLE payslips ADD CONSTRAINT "payslips_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES employees(id);
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN
  ALTER TABLE payslips ADD CONSTRAINT "payslips_organisationId_fkey"
    FOREIGN KEY ("organisationId") REFERENCES organisations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

CREATE INDEX IF NOT EXISTS "payslips_payrollRunId_idx"  ON payslips("payrollRunId");
CREATE INDEX IF NOT EXISTS "payslips_employeeId_idx"    ON payslips("employeeId");

-- ─── 8. payslip_lines ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payslip_lines (
  "id"          TEXT                  NOT NULL,
  "payslipId"   TEXT                  NOT NULL,
  "componentId" TEXT,
  "description" TEXT                  NOT NULL,
  "type"        "SalaryComponentType" NOT NULL,
  "amount"      DECIMAL(20,4)         NOT NULL,
  "isEmployer"  BOOLEAN               NOT NULL DEFAULT false,
  CONSTRAINT "payslip_lines_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE payslip_lines ADD CONSTRAINT "payslip_lines_payslipId_fkey"
    FOREIGN KEY ("payslipId") REFERENCES payslips(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN
  ALTER TABLE payslip_lines ADD CONSTRAINT "payslip_lines_componentId_fkey"
    FOREIGN KEY ("componentId") REFERENCES salary_components(id);
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

CREATE INDEX IF NOT EXISTS "payslip_lines_payslipId_idx" ON payslip_lines("payslipId");

-- ─── 9. Back-relation: payroll_runs on accounting_periods ────────────────────
-- (No DDL needed — foreign key already added above; Prisma handles the relation)

-- ─── 10. GRA compliance columns (idempotent) ─────────────────────────────────

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS "isResident" BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE payslips
  ADD COLUMN IF NOT EXISTS "overtimeTax" DECIMAL(20,4) NOT NULL DEFAULT 0;

COMMIT;
