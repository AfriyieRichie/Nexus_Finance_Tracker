-- Reliefs are only applied in payroll once GRA-activated per employee.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS "activatedReliefs" TEXT[] NOT NULL DEFAULT '{}';
