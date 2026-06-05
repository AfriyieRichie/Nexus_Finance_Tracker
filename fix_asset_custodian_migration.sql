-- Custodian (person/department responsible for the asset) as a first-class field.
ALTER TABLE fixed_assets ADD COLUMN IF NOT EXISTS "custodian" TEXT;
