-- Per-employee SSNIT eligibility. When false (e.g. a locum whose SSNIT is paid by a
-- primary employer), no SSNIT/Tier 1/2/3 is computed in the payroll run; PAYE still applies.
ALTER TABLE "employees"
  ADD COLUMN IF NOT EXISTS "ssnitQualified" BOOLEAN NOT NULL DEFAULT true;
