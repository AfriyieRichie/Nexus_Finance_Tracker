-- Interest-bearing employee loans (reducing-balance amortization).
-- interestRate = annual rate as a fraction (0 = interest-free); termMonths drives the
-- equal payment (EMI); interestIncomeAccountId receives the interest portion at posting.
ALTER TABLE "employee_loans"
  ADD COLUMN IF NOT EXISTS "interestRate" DECIMAL(8,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "termMonths" INTEGER,
  ADD COLUMN IF NOT EXISTS "interestIncomeAccountId" TEXT;
