-- Add the Fixed/Variable flag to salary components.
-- Fixed = standing element assigned to employees; Variable = entered per payroll run.
ALTER TABLE "salary_components"
  ADD COLUMN IF NOT EXISTS "isVariable" BOOLEAN NOT NULL DEFAULT false;
