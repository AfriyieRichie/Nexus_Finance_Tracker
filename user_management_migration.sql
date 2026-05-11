-- User Management Migration
-- Adds account lockout, forced password change, and job title fields to the User table.
-- Run this in the Neon SQL Editor.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS "jobTitle"             TEXT,
  ADD COLUMN IF NOT EXISTS "mustChangePassword"   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "failedLoginAttempts"  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lockedAt"             TIMESTAMP WITH TIME ZONE;
