import {
  BudgetType,
  CommitmentStatus,
  CommitmentType,
  CostCentreLevel,
  Prisma,
} from '@prisma/client';
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
  isReportableSegment?: boolean;
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

export interface CreateCommitmentInput {
  accountId: string;
  costCentreId?: string;
  periodNumber: number;
  amount: number;
  referenceType: CommitmentType;
  reference?: string;
  description?: string;
  raisedDate: string; // YYYY-MM-DD
}

export interface UpdateCommitmentInput {
  invoicedAmount?: number;
  status?: CommitmentStatus;
  description?: string;
}

export interface ImportLineInput {
  accountCode: string;
  costCentreCode?: string;
  amounts: Record<number, number>; // periodNumber → amount
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
    alertThresholdPct: b.alertThresholdPct,
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
  let version = 1;
  let resolvedName = input.name;
  let resolvedFiscalYear = input.fiscalYear;

  if (input.parentBudgetId) {
    const parent = await prisma.budget.findFirst({
      where: { id: input.parentBudgetId, organisationId },
    });
    if (!parent) throw new NotFoundError('Parent budget');
    if (!parent.isApproved) {
      throw new ForbiddenError('Can only create a revision from an approved budget');
    }
    resolvedName = parent.name;
    resolvedFiscalYear = parent.fiscalYear;

    const latestSibling = await prisma.budget.findFirst({
      where: { organisationId, fiscalYear: parent.fiscalYear, name: parent.name },
      orderBy: { version: 'desc' },
    });
    version = (latestSibling?.version ?? 0) + 1;
  } else {
    const existing = await prisma.budget.findFirst({
      where: { organisationId, fiscalYear: resolvedFiscalYear, name: resolvedName, version: 1 },
    });
    if (existing) {
      throw new ConflictError(
        `A budget named '${resolvedName}' already exists for fiscal year ${resolvedFiscalYear}`,
      );
    }
  }

  if (input.lines) validateLines(input.lines);

  return prisma.budget.create({
    data: {
      organisationId,
      name: resolvedName,
      fiscalYear: resolvedFiscalYear,
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

export async function updateBudget(
  organisationId: string,
  budgetId: string,
  input: { alertThresholdPct?: number | null },
) {
  const budget = await prisma.budget.findFirst({ where: { id: budgetId, organisationId } });
  if (!budget) throw new NotFoundError('Budget');

  return prisma.budget.update({
    where: { id: budgetId },
    data: {
      ...(input.alertThresholdPct !== undefined && {
        alertThresholdPct:
          input.alertThresholdPct === null ? null : new Prisma.Decimal(input.alertThresholdPct),
      }),
    },
  });
}

export async function copyBudget(
  organisationId: string,
  _userId: string,
  input: { sourceBudgetId: string; targetFiscalYear: number; targetName: string; upliftPct: number },
) {
  if (input.targetFiscalYear < 2000 || input.targetFiscalYear > 2100) {
    throw new ValidationError('targetFiscalYear must be between 2000 and 2100');
  }

  const source = await prisma.budget.findFirst({
    where: { id: input.sourceBudgetId, organisationId },
    include: {
      lines: true,
    },
  });
  if (!source) throw new NotFoundError('Source budget');

  const existing = await prisma.budget.findFirst({
    where: { organisationId, fiscalYear: input.targetFiscalYear, name: input.targetName, version: 1 },
  });
  if (existing) {
    throw new ConflictError(
      `A budget named '${input.targetName}' already exists for fiscal year ${input.targetFiscalYear}`,
    );
  }

  const multiplier = new Prisma.Decimal(1).plus(
    new Prisma.Decimal(input.upliftPct).dividedBy(100),
  );

  return prisma.budget.create({
    data: {
      organisationId,
      name: input.targetName,
      fiscalYear: input.targetFiscalYear,
      budgetType: BudgetType.ORIGINAL,
      version: 1,
      lines: {
        create: source.lines.map((l) => ({
          accountId: l.accountId,
          costCentreId: l.costCentreId,
          periodNumber: l.periodNumber,
          amount: l.amount.times(multiplier).toDecimalPlaces(4),
        })),
      },
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

export async function importBudgetLines(
  organisationId: string,
  budgetId: string,
  rows: ImportLineInput[],
) {
  const budget = await prisma.budget.findFirst({ where: { id: budgetId, organisationId } });
  if (!budget) throw new NotFoundError('Budget');
  if (budget.isApproved) throw new ForbiddenError('Cannot import lines into an approved budget');

  // Resolve account codes → IDs
  const accountCodes = [...new Set(rows.map((r) => r.accountCode))];
  const accounts = await prisma.account.findMany({
    where: { organisationId, code: { in: accountCodes }, isDeleted: false },
    select: { id: true, code: true },
  });
  const accountMap = new Map(accounts.map((a) => [a.code, a.id]));

  // Resolve CC codes → IDs
  const ccCodes = [...new Set(rows.flatMap((r) => (r.costCentreCode ? [r.costCentreCode] : [])))];
  const centres = ccCodes.length
    ? await prisma.costCentre.findMany({
        where: { organisationId, code: { in: ccCodes } },
        select: { id: true, code: true },
      })
    : [];
  const ccMap = new Map(centres.map((c) => [c.code, c.id]));

  const lines: Prisma.BudgetLineCreateManyInput[] = [];
  const errors: string[] = [];

  for (const row of rows) {
    const accountId = accountMap.get(row.accountCode);
    if (!accountId) { errors.push(`Account code '${row.accountCode}' not found`); continue; }

    const costCentreId =
      row.costCentreCode ? (ccMap.get(row.costCentreCode) ?? null) : null;
    if (row.costCentreCode && !costCentreId) {
      errors.push(`Cost centre code '${row.costCentreCode}' not found`);
      continue;
    }

    for (const [periodStr, amount] of Object.entries(row.amounts)) {
      const periodNumber = parseInt(periodStr, 10);
      if (amount > 0) {
        lines.push({ budgetId, accountId, costCentreId, periodNumber, amount: new Prisma.Decimal(amount) });
      }
    }
  }

  if (errors.length) throw new ValidationError(errors.join('; '));

  // Replace all lines atomically
  await prisma.$transaction([
    prisma.budgetLine.deleteMany({ where: { budgetId } }),
    prisma.budgetLine.createMany({ data: lines }),
  ]);

  return getBudget(organisationId, budgetId);
}

export async function updateBudgetLines(
  organisationId: string,
  budgetId: string,
  lines: BudgetLineInput[],
) {
  const budget = await prisma.budget.findFirst({ where: { id: budgetId, organisationId } });
  if (!budget) throw new NotFoundError('Budget');
  if (budget.isApproved) throw new ForbiddenError('Cannot modify lines on an approved budget');

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

export async function approveBudget(organisationId: string, budgetId: string, userId: string) {
  const budget = await prisma.budget.findFirst({ where: { id: budgetId, organisationId } });
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
  if (budget._count.revisions > 0) throw new ForbiddenError('Cannot delete a budget that has revisions');

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
  committed: string;
  actual: string;
  available: string;
  variance: string;
  variancePct: string | null;
  isFlagged: boolean;
}

export async function getBudgetVsActual(
  organisationId: string,
  budgetId: string,
  costCentreId?: string,
  rollupChildren?: boolean,
): Promise<BudgetVsActualLine[]> {
  const budget = await prisma.budget.findFirst({
    where: { id: budgetId, organisationId },
  });
  if (!budget) throw new NotFoundError('Budget');

  // Build cost centre filter — optionally expand to whole subtree
  let ccFilter: string[] | undefined;
  if (costCentreId) {
    if (rollupChildren) {
      ccFilter = await getDescendantCCIds(organisationId, costCentreId);
    } else {
      ccFilter = [costCentreId];
    }
  }

  const lines = await prisma.budgetLine.findMany({
    where: {
      budgetId,
      ...(ccFilter
        ? { costCentreId: { in: ccFilter } }
        : costCentreId === null
          ? { costCentreId: null }
          : undefined),
    },
    include: {
      account: { select: { id: true, code: true, name: true, class: true } },
      costCentre: { select: { id: true, code: true, name: true } },
    },
  });

  if (!lines.length) return [];

  const accountIds = [...new Set(lines.map((l) => l.accountId))];

  const [ledgerTotals, commitmentTotals] = await Promise.all([
    prisma.ledgerEntry.groupBy({
      by: ['accountId'],
      where: { organisationId, accountId: { in: accountIds } },
      _sum: { debitAmount: true, creditAmount: true },
    }),
    prisma.budgetCommitment.groupBy({
      by: ['accountId', 'costCentreId'],
      where: {
        budgetId,
        status: { in: [CommitmentStatus.OPEN, CommitmentStatus.PARTIALLY_INVOICED] },
        accountId: { in: accountIds },
        ...(ccFilter ? { costCentreId: { in: ccFilter } } : undefined),
      },
      _sum: { amount: true, invoicedAmount: true },
    }),
  ]);

  const ledgerMap = new Map(
    ledgerTotals.map((r) => [
      r.accountId,
      {
        debit: r._sum.debitAmount ?? new Prisma.Decimal(0),
        credit: r._sum.creditAmount ?? new Prisma.Decimal(0),
      },
    ]),
  );

  // Commitment map: key = accountId::ccId
  const commitMap = new Map<string, Prisma.Decimal>();
  for (const r of commitmentTotals) {
    const key = `${r.accountId}::${r.costCentreId ?? ''}`;
    const open = (r._sum.amount ?? new Prisma.Decimal(0)).minus(
      r._sum.invoicedAmount ?? new Prisma.Decimal(0),
    );
    commitMap.set(key, open.isNegative() ? new Prisma.Decimal(0) : open);
  }

  // Group lines by account+costCentre (rollup mode collapses all CCs into one per account)
  interface Group {
    accountId: string;
    accountCode: string;
    accountName: string;
    accountClass: string;
    costCentreId: string | null;
    costCentreCode: string | null;
    costCentreName: string | null;
    budgeted: Prisma.Decimal;
  }

  const groups = new Map<string, Group>();

  for (const line of lines) {
    const ccKey = rollupChildren && ccFilter ? '' : (line.costCentreId ?? '');
    const key = `${line.accountId}::${ccKey}`;
    const existing = groups.get(key);
    if (existing) {
      existing.budgeted = existing.budgeted.plus(line.amount);
    } else {
      groups.set(key, {
        accountId: line.accountId,
        accountCode: line.account.code,
        accountName: line.account.name,
        accountClass: line.account.class,
        costCentreId: rollupChildren && ccFilter ? null : line.costCentreId,
        costCentreCode: rollupChildren && ccFilter ? null : (line.costCentre?.code ?? null),
        costCentreName: rollupChildren && ccFilter ? null : (line.costCentre?.name ?? null),
        budgeted: line.amount,
      });
    }
  }

  const threshold = budget.alertThresholdPct ? Number(budget.alertThresholdPct) : null;
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

    // Rollup: sum commitments across all CCs in subtree
    let committed = new Prisma.Decimal(0);
    if (rollupChildren && ccFilter) {
      for (const ccId of ccFilter) {
        const k = `${group.accountId}::${ccId}`;
        committed = committed.plus(commitMap.get(k) ?? new Prisma.Decimal(0));
      }
      // Also no-CC commitments on this budget
      committed = committed.plus(
        commitMap.get(`${group.accountId}::`) ?? new Prisma.Decimal(0),
      );
    } else {
      const k = `${group.accountId}::${group.costCentreId ?? ''}`;
      committed = commitMap.get(k) ?? new Prisma.Decimal(0);
    }

    const available = group.budgeted.minus(committed).minus(actual);
    const variance = group.budgeted.minus(actual);
    const variancePct = group.budgeted.isZero()
      ? null
      : variance.dividedBy(group.budgeted).times(100).toFixed(2);

    const isFlagged =
      threshold !== null && variancePct !== null && Math.abs(Number(variancePct)) > threshold;

    results.push({
      accountId: group.accountId,
      accountCode: group.accountCode,
      accountName: group.accountName,
      accountClass: group.accountClass,
      costCentreId: group.costCentreId,
      costCentreCode: group.costCentreCode,
      costCentreName: group.costCentreName,
      budgeted: group.budgeted.toFixed(4),
      committed: committed.toFixed(4),
      actual: actual.toFixed(4),
      available: available.toFixed(4),
      variance: variance.toFixed(4),
      variancePct,
      isFlagged,
    });
  }

  results.sort((a, b) => {
    const cc = (a.costCentreCode ?? '').localeCompare(b.costCentreCode ?? '');
    return cc !== 0 ? cc : a.accountCode.localeCompare(b.accountCode);
  });

  return results;
}

// ─── Commitments ──────────────────────────────────────────────────────────────

export async function listCommitments(organisationId: string, budgetId: string) {
  const budget = await prisma.budget.findFirst({ where: { id: budgetId, organisationId } });
  if (!budget) throw new NotFoundError('Budget');

  return prisma.budgetCommitment.findMany({
    where: { budgetId, organisationId },
    orderBy: [{ status: 'asc' }, { raisedDate: 'desc' }],
    include: {
      account: { select: { id: true, code: true, name: true } },
      costCentre: { select: { id: true, code: true, name: true } },
    },
  });
}

export async function createCommitment(
  organisationId: string,
  budgetId: string,
  userId: string,
  input: CreateCommitmentInput,
) {
  const budget = await prisma.budget.findFirst({ where: { id: budgetId, organisationId } });
  if (!budget) throw new NotFoundError('Budget');
  if (!budget.isApproved) throw new ForbiddenError('Commitments can only be raised against approved budgets');

  if (input.periodNumber < 1 || input.periodNumber > 12) {
    throw new ValidationError('periodNumber must be between 1 and 12');
  }
  if (input.amount <= 0) throw new ValidationError('Commitment amount must be positive');

  return prisma.budgetCommitment.create({
    data: {
      organisationId,
      budgetId,
      accountId: input.accountId,
      costCentreId: input.costCentreId ?? null,
      periodNumber: input.periodNumber,
      amount: new Prisma.Decimal(input.amount),
      referenceType: input.referenceType,
      reference: input.reference ?? null,
      description: input.description ?? null,
      raisedDate: new Date(input.raisedDate),
      raisedBy: userId,
    },
    include: {
      account: { select: { id: true, code: true, name: true } },
      costCentre: { select: { id: true, code: true, name: true } },
    },
  });
}

export async function updateCommitment(
  organisationId: string,
  commitmentId: string,
  input: UpdateCommitmentInput,
) {
  const commitment = await prisma.budgetCommitment.findFirst({
    where: { id: commitmentId, organisationId },
  });
  if (!commitment) throw new NotFoundError('Commitment');
  if (commitment.status === CommitmentStatus.CANCELLED) {
    throw new ForbiddenError('Cannot update a cancelled commitment');
  }

  let status = input.status ?? commitment.status;
  const invoiced = new Prisma.Decimal(input.invoicedAmount ?? commitment.invoicedAmount);

  if (invoiced.greaterThanOrEqualTo(commitment.amount)) {
    status = CommitmentStatus.FULLY_INVOICED;
  } else if (invoiced.greaterThan(0)) {
    status = CommitmentStatus.PARTIALLY_INVOICED;
  }

  return prisma.budgetCommitment.update({
    where: { id: commitmentId },
    data: {
      ...(input.invoicedAmount !== undefined && { invoicedAmount: invoiced }),
      ...(input.description !== undefined && { description: input.description }),
      status,
      ...(status === CommitmentStatus.FULLY_INVOICED || status === CommitmentStatus.CANCELLED
        ? { closedAt: new Date() }
        : {}),
    },
    include: {
      account: { select: { id: true, code: true, name: true } },
      costCentre: { select: { id: true, code: true, name: true } },
    },
  });
}

// ─── IFRS 8 Segment Report ────────────────────────────────────────────────────

export interface SegmentLine {
  costCentreId: string;
  costCentreCode: string;
  costCentreName: string;
  revenue: string;
  expenses: string;
  segmentResult: string;
}

export async function getSegmentReport(
  organisationId: string,
  fiscalYear?: number,
): Promise<SegmentLine[]> {
  const segments = await prisma.costCentre.findMany({
    where: { organisationId, isReportableSegment: true, isActive: true },
    orderBy: { code: 'asc' },
  });

  if (!segments.length) return [];

  // Build date range from fiscal year if provided
  let dateFilter: Prisma.JournalLineWhereInput = {};
  if (fiscalYear) {
    dateFilter = {
      journalEntry: {
        entryDate: {
          gte: new Date(`${fiscalYear}-01-01`),
          lte: new Date(`${fiscalYear}-12-31`),
        },
        status: 'POSTED',
      },
    };
  } else {
    dateFilter = { journalEntry: { status: 'POSTED' } };
  }

  const results: SegmentLine[] = [];

  for (const seg of segments) {
    const lines = await prisma.journalLine.groupBy({
      by: ['accountId'],
      where: {
        costCentreId: seg.id,
        ...dateFilter,
      },
      _sum: { debitAmount: true, creditAmount: true },
    });

    // Get account classes for the accounts found
    const accountIds = lines.map((l) => l.accountId);
    const accounts = accountIds.length
      ? await prisma.account.findMany({
          where: { id: { in: accountIds } },
          select: { id: true, class: true },
        })
      : [];
    const classMap = new Map(accounts.map((a) => [a.id, a.class]));

    let revenue = new Prisma.Decimal(0);
    let expenses = new Prisma.Decimal(0);

    for (const l of lines) {
      const cls = classMap.get(l.accountId);
      const dr = l._sum?.debitAmount ?? new Prisma.Decimal(0);
      const cr = l._sum?.creditAmount ?? new Prisma.Decimal(0);
      if (cls === 'REVENUE') {
        revenue = revenue.plus(cr.minus(dr));
      } else if (cls === 'EXPENSE') {
        expenses = expenses.plus(dr.minus(cr));
      }
    }

    results.push({
      costCentreId: seg.id,
      costCentreCode: seg.code,
      costCentreName: seg.name,
      revenue: revenue.toFixed(4),
      expenses: expenses.toFixed(4),
      segmentResult: revenue.minus(expenses).toFixed(4),
    });
  }

  return results;
}

// ─── Cost Centres ─────────────────────────────────────────────────────────────

export async function listCostCentres(organisationId: string) {
  return prisma.costCentre.findMany({
    where: { organisationId },
    orderBy: [{ level: 'asc' }, { code: 'asc' }],
    include: {
      parent: { select: { id: true, code: true, name: true, level: true } },
      _count: { select: { children: true } },
    },
  });
}

export async function createCostCentre(
  organisationId: string,
  input: CreateCostCentreInput,
) {
  const existing = await prisma.costCentre.findFirst({ where: { organisationId, code: input.code } });
  if (existing) throw new ConflictError(`Cost centre code '${input.code}' already exists`);

  if (input.parentId) {
    const parent = await prisma.costCentre.findFirst({ where: { id: input.parentId, organisationId } });
    if (!parent) throw new NotFoundError('Parent cost centre');

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

  if (input.parentId && input.parentId === id) {
    throw new ValidationError('A cost centre cannot be its own parent');
  }

  return prisma.costCentre.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.level !== undefined && { level: input.level }),
      ...(input.parentId !== undefined && { parentId: input.parentId }),
      ...(input.isReportableSegment !== undefined && { isReportableSegment: input.isReportableSegment }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
    include: {
      parent: { select: { id: true, code: true, name: true, level: true } },
      _count: { select: { children: true } },
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

export async function createDepartment(organisationId: string, input: CreateDepartmentInput) {
  const existing = await prisma.department.findFirst({ where: { organisationId, code: input.code } });
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
      throw new ValidationError(`periodNumber must be between 1 and 12, got ${line.periodNumber}`);
    }
    const amount = new Prisma.Decimal(line.amount);
    if (amount.isNegative()) throw new ValidationError('Budget line amounts must be non-negative');
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

async function getDescendantCCIds(organisationId: string, rootId: string): Promise<string[]> {
  const all = await prisma.costCentre.findMany({
    where: { organisationId },
    select: { id: true, parentId: true },
  });

  const result: string[] = [rootId];
  const queue: string[] = [rootId];

  while (queue.length) {
    const parentId = queue.shift()!;
    for (const cc of all) {
      if (cc.parentId === parentId) {
        result.push(cc.id);
        queue.push(cc.id);
      }
    }
  }

  return result;
}
