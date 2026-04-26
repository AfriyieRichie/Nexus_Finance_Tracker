import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../utils/errors';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BudgetLineInput {
  accountId: string;
  periodNumber: number;
  amount: number | string;
}

export interface CreateBudgetInput {
  name: string;
  fiscalYear: number;
  lines?: BudgetLineInput[];
}

export interface UpdateCostCentreInput {
  name?: string;
  description?: string;
  isActive?: boolean;
}

export interface CreateCostCentreInput {
  code: string;
  name: string;
  description?: string;
}

export interface CreateDepartmentInput {
  code: string;
  name: string;
  description?: string;
}

export interface UpdateDepartmentInput {
  name?: string;
  description?: string;
  isActive?: boolean;
}

// ─── Budget ───────────────────────────────────────────────────────────────────

export async function listBudgets(organisationId: string) {
  const budgets = await prisma.budget.findMany({
    where: { organisationId },
    orderBy: [{ fiscalYear: 'desc' }, { name: 'asc' }],
    include: {
      _count: { select: { lines: true } },
    },
  });

  return budgets.map((b) => ({
    id: b.id,
    organisationId: b.organisationId,
    name: b.name,
    fiscalYear: b.fiscalYear,
    isApproved: b.isApproved,
    approvedBy: b.approvedBy,
    approvedAt: b.approvedAt,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
    lineCount: b._count.lines,
  }));
}

export async function getBudget(organisationId: string, budgetId: string) {
  const budget = await prisma.budget.findFirst({
    where: { id: budgetId, organisationId },
    include: {
      lines: {
        include: {
          account: {
            select: { id: true, code: true, name: true, class: true },
          },
        },
        orderBy: [{ account: { code: 'asc' } }, { periodNumber: 'asc' }],
      },
    },
  });

  if (!budget) throw new NotFoundError('Budget');
  return budget;
}

export async function createBudget(
  organisationId: string,
  _userId: string,
  input: CreateBudgetInput,
) {
  if (input.fiscalYear < 2000 || input.fiscalYear > 2100) {
    throw new ValidationError('fiscalYear must be between 2000 and 2100');
  }

  const existing = await prisma.budget.findFirst({
    where: { organisationId, fiscalYear: input.fiscalYear, name: input.name },
  });
  if (existing) {
    throw new ConflictError(
      `A budget named '${input.name}' already exists for fiscal year ${input.fiscalYear}`,
    );
  }

  if (input.lines) {
    validateLines(input.lines);
  }

  return prisma.budget.create({
    data: {
      organisationId,
      name: input.name,
      fiscalYear: input.fiscalYear,
      lines: input.lines
        ? {
            create: input.lines.map((l) => ({
              accountId: l.accountId,
              periodNumber: l.periodNumber,
              amount: new Prisma.Decimal(l.amount),
            })),
          }
        : undefined,
    },
    include: {
      lines: {
        include: {
          account: { select: { id: true, code: true, name: true, class: true } },
        },
      },
    },
  });
}

export async function updateBudgetLines(
  organisationId: string,
  budgetId: string,
  lines: BudgetLineInput[],
) {
  const budget = await prisma.budget.findFirst({
    where: { id: budgetId, organisationId },
  });
  if (!budget) throw new NotFoundError('Budget');
  if (budget.isApproved) {
    throw new ForbiddenError('Cannot modify lines on an approved budget');
  }

  validateLines(lines);

  // Delete all existing lines then insert new ones atomically
  await prisma.$transaction([
    prisma.budgetLine.deleteMany({ where: { budgetId } }),
    prisma.budgetLine.createMany({
      data: lines.map((l) => ({
        budgetId,
        accountId: l.accountId,
        periodNumber: l.periodNumber,
        amount: new Prisma.Decimal(l.amount),
      })),
    }),
  ]);

  return getBudget(organisationId, budgetId);
}

export async function approveBudget(
  organisationId: string,
  budgetId: string,
  userId: string,
) {
  const budget = await prisma.budget.findFirst({
    where: { id: budgetId, organisationId },
  });
  if (!budget) throw new NotFoundError('Budget');
  if (budget.isApproved) {
    throw new ConflictError('Budget is already approved');
  }

  return prisma.budget.update({
    where: { id: budgetId },
    data: {
      isApproved: true,
      approvedBy: userId,
      approvedAt: new Date(),
    },
  });
}

export async function deleteBudget(organisationId: string, budgetId: string) {
  const budget = await prisma.budget.findFirst({
    where: { id: budgetId, organisationId },
  });
  if (!budget) throw new NotFoundError('Budget');
  if (budget.isApproved) {
    throw new ForbiddenError('Approved budgets cannot be deleted');
  }

  await prisma.budget.delete({ where: { id: budgetId } });
}

// ─── Budget vs Actual ─────────────────────────────────────────────────────────

export interface BudgetVsActualLine {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountClass: string;
  budgeted: string;
  actual: string;
  variance: string;
  variancePct: string | null;
}

export async function getBudgetVsActual(
  organisationId: string,
  budgetId: string,
): Promise<BudgetVsActualLine[]> {
  const budget = await prisma.budget.findFirst({
    where: { id: budgetId, organisationId },
    include: {
      lines: {
        include: {
          account: { select: { id: true, code: true, name: true, class: true } },
        },
      },
    },
  });
  if (!budget) throw new NotFoundError('Budget');

  // Collect all unique account IDs in this budget
  const accountIds = [...new Set(budget.lines.map((l) => l.accountId))];
  if (accountIds.length === 0) return [];

  // Aggregate ledger entries per account for this organisation
  const ledgerTotals = await prisma.ledgerEntry.groupBy({
    by: ['accountId'],
    where: { organisationId, accountId: { in: accountIds } },
    _sum: { debitAmount: true, creditAmount: true },
  });

  const ledgerMap = new Map(
    ledgerTotals.map((row) => [
      row.accountId,
      {
        debit: row._sum.debitAmount ?? new Prisma.Decimal(0),
        credit: row._sum.creditAmount ?? new Prisma.Decimal(0),
      },
    ]),
  );

  // Aggregate budgeted amounts per account (sum across all periods)
  const budgetByAccount = new Map<string, Prisma.Decimal>();
  for (const line of budget.lines) {
    const existing = budgetByAccount.get(line.accountId) ?? new Prisma.Decimal(0);
    budgetByAccount.set(line.accountId, existing.plus(line.amount));
  }

  // Build account metadata map (deduplicated)
  const accountMeta = new Map(
    budget.lines.map((l) => [
      l.accountId,
      { code: l.account.code, name: l.account.name, class: l.account.class },
    ]),
  );

  const results: BudgetVsActualLine[] = [];

  for (const [accountId, budgeted] of budgetByAccount) {
    const meta = accountMeta.get(accountId)!;
    const totals = ledgerMap.get(accountId) ?? {
      debit: new Prisma.Decimal(0),
      credit: new Prisma.Decimal(0),
    };

    // Debit-normal classes: ASSET, EXPENSE — actual = debits - credits
    // Credit-normal classes: LIABILITY, EQUITY, REVENUE — actual = credits - debits
    const debitNormal = meta.class === 'ASSET' || meta.class === 'EXPENSE';
    const actual = debitNormal
      ? totals.debit.minus(totals.credit)
      : totals.credit.minus(totals.debit);

    const variance = budgeted.minus(actual);
    const variancePct = budgeted.isZero()
      ? null
      : variance.dividedBy(budgeted).times(100).toFixed(2);

    results.push({
      accountId,
      accountCode: meta.code,
      accountName: meta.name,
      accountClass: meta.class,
      budgeted: budgeted.toFixed(4),
      actual: actual.toFixed(4),
      variance: variance.toFixed(4),
      variancePct,
    });
  }

  // Sort by account code for consistent ordering
  results.sort((a, b) => a.accountCode.localeCompare(b.accountCode));
  return results;
}

// ─── Cost Centres ─────────────────────────────────────────────────────────────

export async function listCostCentres(organisationId: string) {
  return prisma.costCentre.findMany({
    where: { organisationId, isActive: true },
    orderBy: { code: 'asc' },
  });
}

export async function createCostCentre(
  organisationId: string,
  input: CreateCostCentreInput,
) {
  const existing = await prisma.costCentre.findFirst({
    where: { organisationId, code: input.code },
  });
  if (existing) {
    throw new ConflictError(`Cost centre code '${input.code}' already exists`);
  }

  return prisma.costCentre.create({
    data: {
      organisationId,
      code: input.code,
      name: input.name,
      description: input.description ?? null,
    },
  });
}

export async function updateCostCentre(
  organisationId: string,
  id: string,
  input: UpdateCostCentreInput,
) {
  const costCentre = await prisma.costCentre.findFirst({
    where: { id, organisationId },
  });
  if (!costCentre) throw new NotFoundError('Cost centre');

  return prisma.costCentre.update({
    where: { id },
    data: {
      name: input.name,
      description: input.description,
      isActive: input.isActive,
    },
  });
}

// ─── Departments ──────────────────────────────────────────────────────────────

export async function listDepartments(organisationId: string) {
  return prisma.department.findMany({
    where: { organisationId, isActive: true },
    orderBy: { code: 'asc' },
  });
}

export async function createDepartment(
  organisationId: string,
  input: CreateDepartmentInput,
) {
  const existing = await prisma.department.findFirst({
    where: { organisationId, code: input.code },
  });
  if (existing) {
    throw new ConflictError(`Department code '${input.code}' already exists`);
  }

  return prisma.department.create({
    data: {
      organisationId,
      code: input.code,
      name: input.name,
      description: input.description ?? null,
    },
  });
}

export async function updateDepartment(
  organisationId: string,
  id: string,
  input: UpdateDepartmentInput,
) {
  const department = await prisma.department.findFirst({
    where: { id, organisationId },
  });
  if (!department) throw new NotFoundError('Department');

  return prisma.department.update({
    where: { id },
    data: {
      name: input.name,
      description: input.description,
      isActive: input.isActive,
    },
  });
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

function validateLines(lines: BudgetLineInput[]): void {
  for (const line of lines) {
    if (line.periodNumber < 1 || line.periodNumber > 12) {
      throw new ValidationError(
        `periodNumber must be between 1 and 12, got ${line.periodNumber}`,
      );
    }
    const amount = new Prisma.Decimal(line.amount);
    if (amount.isNegative()) {
      throw new ValidationError('Budget line amounts must be non-negative');
    }
  }

  // Detect duplicate [accountId, periodNumber] pairs within the submitted set
  const seen = new Set<string>();
  for (const line of lines) {
    const key = `${line.accountId}:${line.periodNumber}`;
    if (seen.has(key)) {
      throw new ValidationError(
        `Duplicate budget line: accountId ${line.accountId}, periodNumber ${line.periodNumber}`,
      );
    }
    seen.add(key);
  }
}
