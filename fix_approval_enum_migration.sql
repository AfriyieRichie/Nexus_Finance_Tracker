-- ============================================================
-- Fix: the AP module queries approvals with
-- ApprovalEntityType.SUPPLIER_INVOICE (accounts-payable/ap.service.ts), but the
-- value was never added to the live Postgres enum — the hand-written
-- ap_enhancement_migration.sql targeted a non-existent type name
-- ("approval_entity_type" instead of the Prisma-generated "ApprovalEntityType").
-- Result: supplier-invoice approval requests failed with an invalid-enum error.
--
-- System-wide structural fix. Idempotent (ADD VALUE IF NOT EXISTS).
-- Must run on its own — Postgres forbids using a newly added enum value in the
-- same transaction that adds it.
-- Run in Neon SQL Editor (or via prisma db execute).
-- ============================================================

ALTER TYPE "ApprovalEntityType" ADD VALUE IF NOT EXISTS 'SUPPLIER_INVOICE';
