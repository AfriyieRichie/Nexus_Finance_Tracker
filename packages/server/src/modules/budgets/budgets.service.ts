import { BudgetType, CostCentreLevel, Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../utils/errors';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BudgetLineInput {
  accountId: string;
  costCentreId?: string | null;
  periodNumber: number;
  amount: number | string;
}

export interface CreateBudgetInput {
  name: string;
  fiscalYear: number;
  budgetType?: BudgetType;
  parentBudgetId?: string;
  lines?: BudgetLineInput[];
}

export interface CreateCostCentreInput {
  code: string;
  name: string;
  description?: string;
  level?: CostCentreLevel;
  parentId?: string;
}

export interface UpdateCostCentreInput {
  name?: string;
  description?: string;
  level?: CostCentreLevel;
  parentId?: string | null;
  isActive?: boolean;
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
    orderBy: [{ fiscalYear: 'desc' }, { budgetType: 'asc' }, { version: 'asc' }],
    include: {
      _count: { select: { lines: true } },
      parentBudget: { select: { id: true, name: true, version: true } },
    },
  });

  return budgets.map((b) => ({
    id: b.id,
    organisationId: b.organisationId,
    name: b.name,
    fiscalYear: b.fiscalYear,
    budgetType: b.budgetType,
    version: b.version,
    parentBudgetId: b.parentBudgetId,
    parentBudget: b.parentBudget,
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
      parentBudget: { select: { id: true, name: true, version: true } },
      revisions: { select: { id: true, name: true, version: true, budgetType: true, isApproved: true } },
      lines: {
        include: {
          account: { select: { id: true, code: true, name: true, class: true } },
          costCentre: { select: { id: true, code: true, name: true } },
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

  const budgetType = input.budgetType ?? BudgetType.ORIGINAL;

  // Determine version: auto-increment from siblings with same name+year
  let version = 1;
  if (input.parentBudgetId) {
    const parent = await prisma.budget.findFirst({
      where: { id: input.parentBudgetId, organisationId },
    });
    if (!parent) throw new NotFoundError('Parent budget');
    if (!parent.isApproved) {
      throw new ForbiddenError('Can only create a revision from an approved budget');
    }

    const latestSibling = await prisma.budget.findFirst({
      where: { organisationId, fiscalYear: parent.fiscalYear, name: parent.name },
      orderBy: { version: 'desc' },
    });
    version = (latestSibling?.version ?? 0) + 1;
  } else {
    const existing = await prisma.budget.findFirst({
      where: { organisationId, fiscalYear: input.fiscalYear, name: input.name, version: 1 },
    });
    if (existing) {
      throw new ConflictError(
        `A budget named '${input.name}' already exists for fiscal year ${input.fiscalYear}`,
      );
    }
  }

  if (input.lines) validateLines(input.lines);

  return prisma.budget.create({
    data: {
      organisationId,
      name: input.parentBudgetId
        ? (await prisma.budget.findUniqueOrThrow({ where: { id: input.parentBudgetId } })).name
        : input.name,
      fiscalYear: input.parentBudgetId
        ? (await prisma.budget.findUniqueOrThrow({ where: { id: input.parentBudgetId } })).fiscalYear
        : input.fiscalYear,
      budgetType,
      version,
      parentBudgetId: input.parentBudgetId ?? null,
      lines: input.lines
        ? {
            create: input.lines.map((l) => ({
              accountId: l.accountId,
              costCentreId: l.costCentreId ?? null,
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
          costCentre: { select: { id: true, code: true, name: true } },
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

  await prisma.$transaction([
    prisma.budgetLine.deleteMany({ where: { budgetId } }),
    prisma.budgetLine.createMany({
      data: lines.map((l) => ({
        budgetId,
        accountId: l.accountId,
        costCentreId: l.costCentreId ?? null,
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
  if (budget.isApproved) throw new ConflictError('Budget is already approved');

  return prisma.budget.update({
    where: { id: budgetId },
    data: { isApproved: true, approvedBy: userId, approvedAt: new Date() },
  });
}

export async function deleteBudget(organisationId: string, budgetId: string) {
  const budget = await prisma.budget.findFirst({
    where: { id: budgetId, organisationId },
    include: { _count: { select: { revisions: true } } },
  });
  if (!budget) throw new NotFoundError('Budget');
  if (budget.isApproved) throw new ForbiddenError('Approved budgets cannot be deleted');
  if (budget._count.revisions > 0) {
    throw new ForbiddenError('Cannot delete a budget that has revisions');
  }

  await prisma.budget.delete({ where: { id: budgetId } });
}

// ─── Budget vs Actual ─────────────────────────────────────────────────────────

export interface BudgetVsActualLine {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountClass: string;
  costCentreId: string | null;
  costCentreCode: string | null;
  costCentreName: string | null;
  budgeted: string;
  actual: string;
  variance: string;
  variancePct: string | null;
}

export async function getBudgetVsActual(
  organisationId: string,
  budgetId: string,
  costCentreId?: string,
): Promise<BudgetVsActualLine[]> {
  const budget = await prisma.budget.findFirst({
    where: { id: budgetId, organisationId },
    include: {
      lines: {
        where: costCentreId ? { costCentreId } : undefined,
        include: {
          account: { select: { id: true, code: true, name: true, class: true } },
          costCentre: { select: { id: true, code: true, name: true } },
        },
      },
    },
  });
  if (!budget) throw new NotFoundError('Budget');
  if (budget.lines.length === 0) return [];

  const accountIds = [...new Set(budget.lines.map((l) => l.accountId))];

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

  // Group lines by account + costCentre so each combo is one output row
  type GroupKey = string;
  interface GroupAcc {
    accountId: string;
    accountCode: string;
    accountName: string;
    accountClass: string;
    costCentreId: string | null;
    costCentreCode: string | null;
    costCentreName: string | null;
    budgeted: Prisma.Decimal;
  }
  const groups = new Map<GroupKey, GroupAcc>();

  for (const line of budget.lines) {
    const key = `${line.accountId}::${line.costCentreId ?? ''}`;
    const existing = groups.get(key);
    if (existing) {
      existing.budgeted = existing.budgeted.plus(line.amount);
    } else {
      groups.set(key, {
        accountId: line.accountId,
        accountCode: line.account.code,
        accountName: line.account.name,
        accountClass: line.account.class,
        costCentreId: line.costCentreId,
        costCentreCode: line.costCentre?.code ?? null,
        costCentreName: line.costCentre?.name ?? null,
        budgeted: line.amount,
      });
    }
  }

  const results: BudgetVsActualLine[] = [];

  for (const group of groups.values()) {
    const totals = ledgerMap.get(group.accountId) ?? {
      debit: new Prisma.Decimal(0),
      credit: new Prisma.Decimal(0),
    };

    const debitNormal = group.accountClass === 'ASSET' || group.accountClass === 'EXPENSE';
    const actual = debitNormal
      ? totals.debit.minus(totals.credit)
      : totals.credit.minus(totals.debit);

    const variance = group.budgeted.minus(actual);
    const variancePct = group.budgeted.isZero()
      ? null
      : variance.dividedBy(group.budgeted).times(100).toFixed(2);

    results.push({
      accountId: group.accountId,
      accountCode: group.accountCode,
      accountName: group.accountName,
      accountClass: group.accountClass,
      costCentreId: group.costCentreId,
      costCentreCode: group.costCentreCode,
      costCentreName: group.costCentreName,
      budgeted: group.budgeted.toFixed(4),
      actual: actual.toFixed(4),
      variance: variance.toFixed(4),
      variancePct,
    });
  }

  results.sort((a, b) => {
    const cc = (a.costCentreCode ?? '').localeCompare(b.costCentreCode ?? '');
    return cc !== 0 ? cc : a.accountCode.localeCompare(b.accountCode);
  });

  return results;
}

// ─── Cost Centres ─────────────────────────────────────────────────────────────

export async function listCostCentres(organisationId: string) {
  const centres = await prisma.costCentre.findMany({
    where: { organisationId },
    orderBy: [{ level: 'asc' }, { code: 'asc' }],
    include: {
      parent: { select: { id: true, code: true, name: true, level: true } },
      _count: { select: { children: true } },
    },
  });
  return centres;
}

export async function createCostCentre(
  organisationId: string,
  input: CreateCostCentreInput,
) {
  const existing = await prisma.costCentre.findFirst({
    where: { organisationId, code: input.code },
  });
  if (existing) throw new ConflictError(`Cost centre code '${input.code}' already exists`);

  if (input.parentId) {
    const parent = await prisma.costCentre.findFirst({
      where: { id: input.parentId, organisationId },
    });
    if (!parent) throw new NotFoundError('Parent cost centre');

    // Enforce level ordering: child must be one level below parent
    const levelOrder: CostCentreLevel[] = ['COMPANY', 'DIVISION', 'DEPARTMENT', 'TEAM'];
    const parentIdx = levelOrder.indexOf(parent.level);
    const childLevel = input.level ?? levelOrder[parentIdx + 1];
    if (levelOrder.indexOf(childLevel) <= parentIdx) {
      throw new ValidationError(
        `A child of a ${parent.level} must be at a lower level (e.g. ${levelOrder[parentIdx + 1]})`,
      );
    }
  }

  return prisma.costCentre.create({
    data: {
      organisationId,
      code: input.code,
      name: input.name,
      description: input.description ?? null,
      level: input.level ?? 'DEPARTMENT',
      parentId: input.parentId ?? null,
    },
    include: {
      parent: { select: { id: true, code: true, name: true, level: true } },
      _count: { select: { children: true } },
    },
  });
}

export async function updateCostCentre(
  organisationId: string,
  id: string,
  input: UpdateCostCentreInput,
) {
  const cc = await prisma.costCentre.findFirst({ where: { id, organisationId } });
  if (!cc) throw new NotFoundError('Cost centre');

  if (input.parentId) {
    const parent = await prisma.costCentre.findFirst({
      where: { id: input.parentId, organisationId },
    });
    if (!parent) throw new NotFoundError('Parent cost centre');
    if (input.parentId === id) throw new ValidationError('A cost centre cannot be its own parent');
  }

  return prisma.costCentre.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.level !== undefined && { level: input.level }),
      ...(input.parentId !== undefined && { parentId: input.parentId }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
    include: {
      parent: { select: { id: true, code: true, name: true, level: true } },
      _count: { select: { children: true } },
    },
  });
}

// ─── Departments (legacy — kept for JournalLine compatibility) ────────────────

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
  if (existing) throw new ConflictError(`Department code '${input.code}' already exists`);

  return prisma.department.create({
    data: { organisationId, code: input.code, name: input.name, description: input.description ?? null },
  });
}

export async function updateDepartment(
  organisationId: string,
  id: string,
  input: UpdateDepartmentInput,
) {
  const dept = await prisma.department.findFirst({ where: { id, organisationId } });
  if (!dept) throw new NotFoundError('Department');

  return prisma.department.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
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

  const seen = new Set<string>();
  for (const line of lines) {
    const key = `${line.accountId}:${line.costCentreId ?? ''}:${line.periodNumber}`;
    if (seen.has(key)) {
      throw new ValidationError(
        `Duplicate budget line: account ${line.accountId}, cost centre ${line.costCentreId ?? 'none'}, period ${line.periodNumber}`,
      );
    }
    seen.add(key);
  }
}
