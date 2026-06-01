-- Migration: add vatRegistrationNo to organisations
-- Run this in the Neon SQL Editor

ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS vat_registration_no TEXT;
