-- Add INACTIVE value to AssetStatus enum
-- Run in Neon SQL Editor (console.neon.tech → SQL Editor)
-- Safe to run more than once

DO $$ BEGIN
  ALTER TYPE "AssetStatus" ADD VALUE 'INACTIVE';
EXCEPTION WHEN duplicate_object THEN null;
END $$;
