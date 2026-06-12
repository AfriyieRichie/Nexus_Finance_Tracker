-- Configurable reliefs/benefits/tax-rule tables on statutory config, plus GRA
-- benefit codes and NSP flag on employees.
ALTER TABLE payroll_statutory_configs ADD COLUMN IF NOT EXISTS "reliefs" JSONB;
ALTER TABLE payroll_statutory_configs ADD COLUMN IF NOT EXISTS "benefits" JSONB;
ALTER TABLE payroll_statutory_configs ADD COLUMN IF NOT EXISTS "taxRules" JSONB;

ALTER TABLE employees ADD COLUMN IF NOT EXISTS "accommodationCode" TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS "vehicleCode" TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS "isNsp" BOOLEAN NOT NULL DEFAULT false;
