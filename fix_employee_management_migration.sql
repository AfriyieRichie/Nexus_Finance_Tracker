-- Employee management: status workflow, personal/relief attributes, non-cash
-- benefit, and a configurable non-resident flat PAYE rate.
DO $$ BEGIN CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE','SUSPENDED','RESIGNED','DISMISSED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "Gender" AS ENUM ('MALE','FEMALE','OTHER'); EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE employees ADD COLUMN IF NOT EXISTS "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS "statusReason" TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS "gender" "Gender";
ALTER TABLE employees ADD COLUMN IF NOT EXISTS "dateOfBirth" DATE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS "isMarried" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS "isDisabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS "numberOfChildren" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS "agedDependants" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS "vehicleBenefit" DECIMAL(20,4);

-- Backfill status from the existing isActive flag (inactive → suspended).
UPDATE employees SET "status" = 'SUSPENDED' WHERE "isActive" = false AND "status" = 'ACTIVE';

ALTER TABLE payroll_statutory_configs ADD COLUMN IF NOT EXISTS "nonResidentFlatRate" DECIMAL(6,4) NOT NULL DEFAULT 0.25;
