-- ============================================================
-- Fix: the budgets and budget_lines tables carry STALE unique indexes left over
-- from before their uniqueness rules were widened. They are bare unique indexes
-- (not table constraints), so they must be removed with DROP INDEX, not
-- DROP CONSTRAINT. The current, correct unique indexes already exist alongside
-- them and keep enforcing uniqueness.
--
--   budgets:  stale (organisationId, fiscalYear, name)
--             -> blocks creating a revision (v2). Correct index includes version:
--                (organisationId, fiscalYear, name, version) — already present.
--   budget_lines: stale (budgetId, accountId, periodNumber)
--             -> blocks the same account+period across different cost centres.
--                Correct index includes costCentreId:
--                (budgetId, accountId, costCentreId, periodNumber) — already present.
--
-- Idempotent (IF EXISTS). System-wide. Run in Neon SQL Editor / prisma db execute.
-- ============================================================

DROP INDEX IF EXISTS "budgets_organisationId_fiscalYear_name_key";
DROP INDEX IF EXISTS "budget_lines_budgetId_accountId_periodNumber_key";
