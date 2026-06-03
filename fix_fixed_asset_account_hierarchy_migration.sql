-- ============================================================
-- Fix: the retail / services / technology COA templates nested each
-- "Accumulated Depreciation/Amortisation" account as a CHILD of its matching
-- "Cost" account. That made the Cost account a non-leaf, so the fixed-asset
-- category form (which lists posting/leaf accounts) could not show the Cost
-- accounts — only the accum-depreciation accounts appeared. It also misstated
-- reporting, because the Cost account's roll-up became Cost − Accum = net book
-- value instead of gross cost.
--
-- World-class practice (QuickBooks/Xero/Sage/NetSuite/SAP): Cost and Accumulated
-- Depreciation are SIBLING postable accounts under a non-postable header, never
-- parent/child. This re-parents each "Accum…" account up to its Cost account's
-- parent (the PP&E / Intangibles header), making them siblings.
--
-- Precise + safe: only moves accounts named "...Accum..." whose parent is named
-- "...Cost". The agriculture template (Accum sits under a class group like
-- "Building", not under a "Cost" account) is intentionally left untouched.
-- Idempotent — after running, the accum account's parent is the header (not a
-- "Cost" account), so a re-run matches nothing. System-wide (all orgs).
-- Run in Neon SQL Editor (or via prisma db execute).
-- ============================================================

UPDATE accounts a
SET "parentId" = p."parentId"
FROM accounts p
WHERE a."parentId" = p.id
  AND a."isDeleted" = false
  AND a.name ILIKE '%Accum%'
  AND p.name ILIKE '%Cost%';
