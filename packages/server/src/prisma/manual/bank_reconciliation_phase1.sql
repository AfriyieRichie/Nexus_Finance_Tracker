-- Bank Reconciliation Phase 1 Migration
-- Run in Neon SQL Editor (console.neon.tech → SQL Editor)
-- Safe to run more than once — all statements are idempotent

-- Add lock + sign-off fields to bank_statements
ALTER TABLE "bank_statements"
  ADD COLUMN IF NOT EXISTS "isLocked"     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "reconciledBy" TEXT;

-- Add match note + journal reference to bank_statement_lines
ALTER TABLE "bank_statement_lines"
  ADD COLUMN IF NOT EXISTS "matchNote"      TEXT,
  ADD COLUMN IF NOT EXISTS "journalEntryId" TEXT;
