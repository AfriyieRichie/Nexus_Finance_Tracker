import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { NotFoundError } from '../../utils/errors';

// ─── Account Ledger ──────────────────────────────────────────────────────────

export interface LedgerQuery {
  fromDate?: string;
  toDate?: string;
  periodId?: string;
  page: number;
  pageSize: number;
}

export async function getAccountLedger(
  organisationId: string,
  accountId: string,
  query: LedgerQuery,
) {
  // Verify account belongs to this org
  const account = await prisma.account.findFirst({
    where: { id: accountId, organisationId, isDeleted: false },
    select: { id: true, code: true, name: true, class: true, type: true },
  });
  if (!account) throw new NotFoundError('Account not found');

  const where: Prisma.LedgerEntryWhereInput = {
    organisationId,
    accountId,
    ...(query.periodId && { periodId: query.periodId }),
    ...((query.fromDate || query.toDate) && {
      transactionDate: {
        ...(query.fromDate && { gte: new Date(query.fromDate + 'T00:00:00Z') }),
        ...(query.toDate && { lte: new Date(query.toDate + 'T00:00:00Z') }),
      },
    }),
  };

  const [total, entries] = await Promise.all([
    prisma.ledgerEntry.count({ where }),
    prisma.ledgerEntry.findMany({
      where,
      orderBy: [{ transactionDate: 'asc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        journalEntry: {
          select: {
            journalNumber: true,
            type: true,
            description: true,
            reference: true,
          },
        },
      },
    }),
  ]);

  // Opening balance: sum of all entries before the first entry in this page range
  let openingBalance = new Prisma.Decimal(0);
  if (query.fromDate) {
    const agg = await prisma.ledgerEntry.aggregate({
      where: {
        organisationId,
        accountId,
        transactionDate: { lt: new Date(query.fromDate + 'T00:00:00Z') },
      },
      _sum: { debitAmount: true, creditAmount: true },
    });
    openingBalance = (agg._sum.debitAmount ?? new Prisma.Decimal(0))
      .sub(agg._sum.creditAmount ?? new Prisma.Decimal(0));
  }

  return { account, entries, openingBalance, total, page: query.page, pageSize: query.pageSize };
}

// ─── Trial Balance ────────────────────────────────────────────────────────────

export interface TrialBalanceOptions {
  asOfDate?: string;
  periodId?: string;
  includeZeroBalances?: boolean;
}

export interface TrialBalanceLine {
  accountId: string;
  code: string;
  name: string;
  class: string;
  subClass: string | null;
  type: string;
  level: number;
  totalDebit: string;
  totalCredit: string;
  balance: string;
  normalBalance: 'DEBIT' | 'CREDIT';
}

export async function getTrialBalance(
  organisationId: string,
  options: TrialBalanceOptions = {},
): Promise<{ lines: TrialBalanceLine[]; totalDebit: string; totalCredit: string; isBalanced: boolean }> {
  const dateFilter: Prisma.LedgerEntryWhereInput = options.asOfDate
    ? { transactionDate: { lte: new Date(options.asOfDate + 'T00:00:00Z') } }
    : options.periodId
    ? { periodId: options.periodId }
    : {};

  // Aggregate all posted ledger amounts grouped by account
  const aggregations = await prisma.ledgerEntry.groupBy({
    by: ['accountId'],
    where: { organisationId, ...dateFilter },
    _sum: { debitAmount: true, creditAmount: true },
  });

  if (aggregations.length === 0) {
    return { lines: [], totalDebit: '0.0000', totalCredit: '0.0000', isBalanced: true };
  }

  const accountIds = aggregations.map((a) => a.accountId);
  const accounts = await prisma.account.findMany({
    where: { id: { in: accountIds }, organisationId, isDeleted: false },
    select: { id: true, code: true, name: true, class: true, subClass: true, type: true, level: true },
    orderBy: { code: 'asc' },
  });

  const aggMap = new Map(aggregations.map((a) => [a.accountId, a._sum]));

  let grandDebit = new Prisma.Decimal(0);
  let grandCredit = new Prisma.Decimal(0);

  const lines: TrialBalanceLine[] = [];

  for (const account of accounts) {
    const sums = aggMap.get(account.id);
    const totalDebit = sums?.debitAmount ?? new Prisma.Decimal(0);
    const totalCredit = sums?.creditAmount ?? new Prisma.Decimal(0);
    const netBalance = totalDebit.sub(totalCredit);

    // Skip zero-balance accounts unless requested
    if (!options.includeZeroBalances && netBalance.isZero()) continue;

    const debitNormal = account.class === 'ASSET' || account.class === 'EXPENSE';
    const balance = debitNormal ? netBalance : netBalance.neg();

    grandDebit = grandDebit.add(totalDebit);
    grandCredit = grandCredit.add(totalCredit);

    lines.push({
      accountId: account.id,
      code: account.code,
      name: account.name,
      class: account.class,
      subClass: account.subClass,
      type: account.type,
      level: account.level,
      totalDebit: totalDebit.toFixed(4),
      totalCredit: totalCredit.toFixed(4),
      balance: balance.toFixed(4),
      normalBalance: debitNormal ? 'DEBIT' : 'CREDIT',
    });
  }

  const isBalanced = grandDebit.equals(grandCredit);

  return {
    lines,
    totalDebit: grandDebit.toFixed(4),
    totalCredit: grandCredit.toFixed(4),
    isBalanced,
  };
}

// ─── General Ledger Summary (all accounts with activity) ─────────────────────

export async function getLedgerSummary(
  organisationId: string,
  periodId: string,
) {
  const period = await prisma.accountingPeriod.findFirst({
    where: { id: periodId, organisationId },
    select: { name: true, fiscalYear: true, periodNumber: true, startDate: true, endDate: true },
  });
  if (!period) throw new NotFoundError('Period not found');

  const aggregations = await prisma.ledgerEntry.groupBy({
    by: ['accountId'],
    where: { organisationId, periodId },
    _sum: { debitAmount: true, creditAmount: true },
    _count: { id: true },
  });

  const accountIds = aggregations.map((a) => a.accountId);
  const accounts = await prisma.account.findMany({
    where: { id: { in: accountIds }, organisationId, isDeleted: false },
    select: { id: true, code: true, name: true, class: true, type: true },
    orderBy: { code: 'asc' },
  });

  const aggMap = new Map(aggregations.map((a) => [a.accountId, a]));

  const summary = accounts.map((acc) => {
    const agg = aggMap.get(acc.id)!;
    return {
      ...acc,
      totalDebit: (agg._sum.debitAmount ?? new Prisma.Decimal(0)).toFixed(4),
      totalCredit: (agg._sum.creditAmount ?? new Prisma.Decimal(0)).toFixed(4),
      transactionCount: agg._count.id,
    };
  });

  return { period, accounts: summary };
}
