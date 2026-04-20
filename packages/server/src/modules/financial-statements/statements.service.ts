import { Prisma, AccountClass, AccountType } from '@prisma/client';
import { prisma } from '../../config/database';
import { NotFoundError } from '../../utils/errors';

// ─── Shared Types ─────────────────────────────────────────────────────────────

export interface StatementLine {
  accountId: string;
  code: string;
  name: string;
  class: string;
  type: string;
  subClass: string | null;
  level: number;
  balance: string;
}

export interface StatementSection {
  label: string;
  lines: StatementLine[];
  subtotal: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function verifyOrg(organisationId: string) {
  const org = await prisma.organisation.findUnique({
    where: { id: organisationId },
    select: { id: true, name: true, baseCurrency: true },
  });
  if (!org) throw new NotFoundError('Organisation not found');
  return org;
}

function buildDateFilter(asOfDate?: string, periodId?: string): Prisma.LedgerEntryWhereInput {
  if (asOfDate) return { transactionDate: { lte: new Date(asOfDate + 'T23:59:59Z') } };
  if (periodId) return { periodId };
  return {};
}

function buildPeriodFilter(
  fromDate?: string,
  toDate?: string,
  periodId?: string,
): Prisma.LedgerEntryWhereInput {
  if (periodId) return { periodId };
  return {
    ...(fromDate && { transactionDate: { gte: new Date(fromDate + 'T00:00:00Z') } }),
    ...(toDate && { transactionDate: { lte: new Date(toDate + 'T23:59:59Z') } }),
  };
}

async function aggregateByClass(
  organisationId: string,
  classes: AccountClass[],
  dateFilter: Prisma.LedgerEntryWhereInput,
): Promise<Map<string, { debit: Prisma.Decimal; credit: Prisma.Decimal }>> {
  const aggs = await prisma.ledgerEntry.groupBy({
    by: ['accountId'],
    where: { organisationId, account: { class: { in: classes } }, ...dateFilter },
    _sum: { debitAmount: true, creditAmount: true },
  });

  return new Map(
    aggs.map((a) => [
      a.accountId,
      {
        debit: a._sum.debitAmount ?? new Prisma.Decimal(0),
        credit: a._sum.creditAmount ?? new Prisma.Decimal(0),
      },
    ]),
  );
}

async function getAccounts(
  organisationId: string,
  classes: AccountClass[],
  accountIds: string[],
) {
  if (accountIds.length === 0) return [];
  return prisma.account.findMany({
    where: { id: { in: accountIds }, organisationId, class: { in: classes }, isDeleted: false },
    select: { id: true, code: true, name: true, class: true, subClass: true, type: true, level: true },
    orderBy: { code: 'asc' },
  });
}

function netBalance(
  accountClass: AccountClass,
  debit: Prisma.Decimal,
  credit: Prisma.Decimal,
): Prisma.Decimal {
  // Debit-normal: ASSET, EXPENSE, CONTRA_LIABILITY, CONTRA_EQUITY, CONTRA_REVENUE
  const debitNormal = accountClass === AccountClass.ASSET || accountClass === AccountClass.EXPENSE;
  return debitNormal ? debit.sub(credit) : credit.sub(debit);
}

function groupIntoSection(
  label: string,
  accounts: Array<{ id: string; code: string; name: string; class: AccountClass; subClass: string | null; type: string; level: number }>,
  aggMap: Map<string, { debit: Prisma.Decimal; credit: Prisma.Decimal }>,
  skipZero = true,
): StatementSection {
  const lines: StatementLine[] = [];
  let subtotal = new Prisma.Decimal(0);

  for (const acc of accounts) {
    const sums = aggMap.get(acc.id);
    if (!sums) continue;
    const balance = netBalance(acc.class, sums.debit, sums.credit);
    if (skipZero && balance.isZero()) continue;
    lines.push({
      accountId: acc.id,
      code: acc.code,
      name: acc.name,
      class: acc.class,
      type: acc.type,
      subClass: acc.subClass,
      level: acc.level,
      balance: balance.toFixed(4),
    });
    subtotal = subtotal.add(balance);
  }

  return { label, lines, subtotal: subtotal.toFixed(4) };
}

// ─── Balance Sheet (IAS 1 Statement of Financial Position) ────────────────────

export interface BalanceSheetOptions {
  asOfDate?: string;
  periodId?: string;
}

export async function getBalanceSheet(organisationId: string, options: BalanceSheetOptions = {}) {
  const org = await verifyOrg(organisationId);
  const dateFilter = buildDateFilter(options.asOfDate, options.periodId);

  const assetAgg = await aggregateByClass(organisationId, [AccountClass.ASSET], dateFilter);
  const liabAgg = await aggregateByClass(organisationId, [AccountClass.LIABILITY], dateFilter);
  const equityAgg = await aggregateByClass(organisationId, [AccountClass.EQUITY], dateFilter);

  const assetIds = [...assetAgg.keys()];
  const liabIds = [...liabAgg.keys()];
  const equityIds = [...equityAgg.keys()];

  const [assetAccounts, liabAccounts, equityAccounts] = await Promise.all([
    getAccounts(organisationId, [AccountClass.ASSET], assetIds),
    getAccounts(organisationId, [AccountClass.LIABILITY], liabIds),
    getAccounts(organisationId, [AccountClass.EQUITY], equityIds),
  ]);

  // Split into current/non-current by subClass
  const currentAssets = assetAccounts.filter((a) => a.subClass === 'CURRENT');
  const nonCurrentAssets = assetAccounts.filter((a) => a.subClass !== 'CURRENT');
  const currentLiab = liabAccounts.filter((a) => a.subClass === 'CURRENT');
  const nonCurrentLiab = liabAccounts.filter((a) => a.subClass !== 'CURRENT');

  const currentAssetsSection = groupIntoSection('Current Assets', currentAssets, assetAgg);
  const nonCurrentAssetsSection = groupIntoSection('Non-Current Assets', nonCurrentAssets, assetAgg);
  const currentLiabSection = groupIntoSection('Current Liabilities', currentLiab, liabAgg);
  const nonCurrentLiabSection = groupIntoSection('Non-Current Liabilities', nonCurrentLiab, liabAgg);
  const equitySection = groupIntoSection('Equity', equityAccounts, equityAgg);

  const totalAssets = new Prisma.Decimal(currentAssetsSection.subtotal)
    .add(new Prisma.Decimal(nonCurrentAssetsSection.subtotal));

  const totalLiabilities = new Prisma.Decimal(currentLiabSection.subtotal)
    .add(new Prisma.Decimal(nonCurrentLiabSection.subtotal));

  const totalEquity = new Prisma.Decimal(equitySection.subtotal);

  // Retained earnings: net income from revenue/expense accounts up to this date
  // (rolled into equity section for display — here we compute and surface it separately)
  const revenueAgg = await aggregateByClass(organisationId, [AccountClass.REVENUE], dateFilter);
  const expenseAgg = await aggregateByClass(organisationId, [AccountClass.EXPENSE], dateFilter);

  let totalRevenue = new Prisma.Decimal(0);
  for (const s of revenueAgg.values()) totalRevenue = totalRevenue.add(s.credit.sub(s.debit));

  let totalExpense = new Prisma.Decimal(0);
  for (const s of expenseAgg.values()) totalExpense = totalExpense.add(s.debit.sub(s.credit));

  const currentPeriodProfit = totalRevenue.sub(totalExpense);
  const totalLiabAndEquity = totalLiabilities.add(totalEquity).add(currentPeriodProfit);

  return {
    organisation: { id: org.id, name: org.name, currency: org.baseCurrency },
    asOfDate: options.asOfDate ?? null,
    assets: {
      current: currentAssetsSection,
      nonCurrent: nonCurrentAssetsSection,
      total: totalAssets.toFixed(4),
    },
    liabilities: {
      current: currentLiabSection,
      nonCurrent: nonCurrentLiabSection,
      total: totalLiabilities.toFixed(4),
    },
    equity: {
      items: equitySection,
      currentPeriodProfit: currentPeriodProfit.toFixed(4),
      total: totalEquity.add(currentPeriodProfit).toFixed(4),
    },
    totalLiabilitiesAndEquity: totalLiabAndEquity.toFixed(4),
    isBalanced: totalAssets.equals(totalLiabAndEquity),
  };
}

// ─── Income Statement / P&L (IAS 1) ──────────────────────────────────────────

export interface IncomeStatementOptions {
  fromDate?: string;
  toDate?: string;
  periodId?: string;
}

export async function getIncomeStatement(
  organisationId: string,
  options: IncomeStatementOptions = {},
) {
  const org = await verifyOrg(organisationId);
  const periodFilter = buildPeriodFilter(options.fromDate, options.toDate, options.periodId);

  const revenueAgg = await aggregateByClass(organisationId, [AccountClass.REVENUE], periodFilter);
  const expenseAgg = await aggregateByClass(organisationId, [AccountClass.EXPENSE], periodFilter);

  const revenueIds = [...revenueAgg.keys()];
  const expenseIds = [...expenseAgg.keys()];

  const [revenueAccounts, expenseAccounts] = await Promise.all([
    getAccounts(organisationId, [AccountClass.REVENUE], revenueIds),
    getAccounts(organisationId, [AccountClass.EXPENSE], expenseIds),
  ]);

  // Revenue grouped by type (REVENUE vs OTHER_INCOME etc.)
  const revenueSection = groupIntoSection('Revenue', revenueAccounts, revenueAgg);

  // Expenses split by account type
  const cogs = expenseAccounts.filter((a) => a.type === AccountType.COST_OF_SALES);
  const opex = expenseAccounts.filter((a) => a.type !== AccountType.COST_OF_SALES);

  const cogsSection = groupIntoSection('Cost of Sales', cogs, expenseAgg);
  const opexSection = groupIntoSection('Operating Expenses', opex, expenseAgg);

  const totalRevenue = new Prisma.Decimal(revenueSection.subtotal);
  const totalCogs = new Prisma.Decimal(cogsSection.subtotal);
  const grossProfit = totalRevenue.sub(totalCogs);
  const totalOpex = new Prisma.Decimal(opexSection.subtotal);
  const profitForPeriod = grossProfit.sub(totalOpex);

  return {
    organisation: { id: org.id, name: org.name, currency: org.baseCurrency },
    period: { fromDate: options.fromDate ?? null, toDate: options.toDate ?? null, periodId: options.periodId ?? null },
    revenue: revenueSection,
    costOfSales: cogsSection,
    grossProfit: grossProfit.toFixed(4),
    operatingExpenses: opexSection,
    profitForPeriod: profitForPeriod.toFixed(4),
  };
}

// ─── Cash Flow Statement (IAS 7 — Indirect Method) ───────────────────────────

export interface CashFlowOptions {
  fromDate?: string;
  toDate?: string;
  periodId?: string;
}

export async function getCashFlowStatement(
  organisationId: string,
  options: CashFlowOptions = {},
) {
  const org = await verifyOrg(organisationId);
  const periodFilter = buildPeriodFilter(options.fromDate, options.toDate, options.periodId);
  const allFilter = { ...periodFilter };

  // Net profit for period (from P&L)
  const pnl = await getIncomeStatement(organisationId, options);
  const netProfit = new Prisma.Decimal(pnl.profitForPeriod);

  // Aggregate all account movements in the period
  const aggs = await prisma.ledgerEntry.groupBy({
    by: ['accountId'],
    where: { organisationId, ...allFilter },
    _sum: { debitAmount: true, creditAmount: true },
  });

  const accountIds = aggs.map((a) => a.accountId);
  const accounts = await prisma.account.findMany({
    where: { id: { in: accountIds }, organisationId, isDeleted: false },
    select: { id: true, code: true, name: true, class: true, subClass: true, type: true },
  });

  const aggMap = new Map(
    aggs.map((a) => [
      a.accountId,
      {
        debit: a._sum.debitAmount ?? new Prisma.Decimal(0),
        credit: a._sum.creditAmount ?? new Prisma.Decimal(0),
      },
    ]),
  );

  // ── Operating activities (indirect method) ───────────────────────────────
  // Start with net profit, then adjust for non-cash items and working capital

  const operatingAdjustments: StatementLine[] = [];
  let totalOperatingAdjustments = new Prisma.Decimal(0);

  // Working capital changes: current assets (excl. cash) and current liabilities
  for (const acc of accounts) {
    const sums = aggMap.get(acc.id)!;
    const isCashAccount = acc.type === AccountType.CASH || acc.type === AccountType.BANK;


    if (acc.class === AccountClass.ASSET && acc.subClass === 'CURRENT' && !isCashAccount) {
      // Increase in current assets = use of cash (negative)
      const change = sums.debit.sub(sums.credit).neg();
      if (!change.isZero()) {
        operatingAdjustments.push({
          accountId: acc.id,
          code: acc.code,
          name: `Change in ${acc.name}`,
          class: acc.class,
          type: acc.type,
          subClass: acc.subClass,
          level: 1,
          balance: change.toFixed(4),
        });
        totalOperatingAdjustments = totalOperatingAdjustments.add(change);
      }
    }

    if (acc.class === AccountClass.LIABILITY && acc.subClass === 'CURRENT') {
      // Increase in current liabilities = source of cash (positive)
      const change = sums.credit.sub(sums.debit);
      if (!change.isZero()) {
        operatingAdjustments.push({
          accountId: acc.id,
          code: acc.code,
          name: `Change in ${acc.name}`,
          class: acc.class,
          type: acc.type,
          subClass: acc.subClass,
          level: 1,
          balance: change.toFixed(4),
        });
        totalOperatingAdjustments = totalOperatingAdjustments.add(change);
      }
    }
  }

  const netCashFromOperating = netProfit.add(totalOperatingAdjustments);

  // ── Investing activities ─────────────────────────────────────────────────
  // Non-current asset movements (PPE purchases / disposals, investments)
  const investingItems: StatementLine[] = [];
  let totalInvesting = new Prisma.Decimal(0);

  for (const acc of accounts) {
    if (acc.class !== AccountClass.ASSET || acc.subClass === 'CURRENT') continue;
    const sums = aggMap.get(acc.id)!;
    // Net increase in non-current assets = cash outflow
    const change = sums.debit.sub(sums.credit).neg();
    if (!change.isZero()) {
      investingItems.push({
        accountId: acc.id,
        code: acc.code,
        name: acc.name,
        class: acc.class,
        type: acc.type,
        subClass: acc.subClass,
        level: 1,
        balance: change.toFixed(4),
      });
      totalInvesting = totalInvesting.add(change);
    }
  }

  // ── Financing activities ─────────────────────────────────────────────────
  // Non-current liability and equity movements
  const financingItems: StatementLine[] = [];
  let totalFinancing = new Prisma.Decimal(0);

  for (const acc of accounts) {
    const isNonCurrentLiab = acc.class === AccountClass.LIABILITY && acc.subClass !== 'CURRENT';
    const isEquity = acc.class === AccountClass.EQUITY;
    if (!isNonCurrentLiab && !isEquity) continue;

    const sums = aggMap.get(acc.id)!;
    // Net increase in liabilities/equity = cash inflow
    const change = sums.credit.sub(sums.debit);
    if (!change.isZero()) {
      financingItems.push({
        accountId: acc.id,
        code: acc.code,
        name: acc.name,
        class: acc.class,
        type: acc.type,
        subClass: acc.subClass,
        level: 1,
        balance: change.toFixed(4),
      });
      totalFinancing = totalFinancing.add(change);
    }
  }

  // ── Opening & closing cash ───────────────────────────────────────────────
  // Find cash & bank accounts
  const cashAccountIds = accounts
    .filter((a) => a.type === AccountType.CASH || a.type === AccountType.BANK)
    .map((a) => a.id);

  // Opening balance: sum of all ledger entries for cash accounts before the period
  let openingCash = new Prisma.Decimal(0);
  if (cashAccountIds.length > 0) {
    const openingFilter: Prisma.LedgerEntryWhereInput = options.fromDate
      ? { transactionDate: { lt: new Date(options.fromDate + 'T00:00:00Z') } }
      : options.periodId
      ? await (async () => {
          const period = await prisma.accountingPeriod.findUnique({
            where: { id: options.periodId },
            select: { startDate: true },
          });
          return period ? { transactionDate: { lt: period.startDate } } : {};
        })()
      : {};

    if (Object.keys(openingFilter).length > 0) {
      const openingAgg = await prisma.ledgerEntry.aggregate({
        where: { organisationId, accountId: { in: cashAccountIds }, ...openingFilter },
        _sum: { debitAmount: true, creditAmount: true },
      });
      openingCash = (openingAgg._sum.debitAmount ?? new Prisma.Decimal(0)).sub(
        openingAgg._sum.creditAmount ?? new Prisma.Decimal(0),
      );
    }
  }

  const netChange = netCashFromOperating.add(totalInvesting).add(totalFinancing);
  const closingCash = openingCash.add(netChange);

  return {
    organisation: { id: org.id, name: org.name, currency: org.baseCurrency },
    period: {
      fromDate: options.fromDate ?? null,
      toDate: options.toDate ?? null,
      periodId: options.periodId ?? null,
    },
    operatingActivities: {
      netProfit: netProfit.toFixed(4),
      workingCapitalAdjustments: operatingAdjustments,
      totalAdjustments: totalOperatingAdjustments.toFixed(4),
      netCashFromOperating: netCashFromOperating.toFixed(4),
    },
    investingActivities: {
      items: investingItems,
      netCashFromInvesting: totalInvesting.toFixed(4),
    },
    financingActivities: {
      items: financingItems,
      netCashFromFinancing: totalFinancing.toFixed(4),
    },
    netChangeInCash: netChange.toFixed(4),
    openingCashBalance: openingCash.toFixed(4),
    closingCashBalance: closingCash.toFixed(4),
  };
}

// ─── Statement of Changes in Equity (IAS 1) ──────────────────────────────────

export interface ChangesInEquityOptions {
  fromDate?: string;
  toDate?: string;
  periodId?: string;
}

export async function getChangesInEquity(
  organisationId: string,
  options: ChangesInEquityOptions = {},
) {
  const org = await verifyOrg(organisationId);
  const periodFilter = buildPeriodFilter(options.fromDate, options.toDate, options.periodId);

  const equityAgg = await aggregateByClass(organisationId, [AccountClass.EQUITY], periodFilter);

  const equityIds = [...equityAgg.keys()];
  const equityAccounts = await prisma.account.findMany({
    where: { id: { in: equityIds }, organisationId, isDeleted: false },
    select: { id: true, code: true, name: true, class: true, subClass: true, type: true, level: true },
    orderBy: { code: 'asc' },
  });

  // Opening balances: equity before this period
  const openingFilter: Prisma.LedgerEntryWhereInput = options.fromDate
    ? { transactionDate: { lt: new Date(options.fromDate + 'T00:00:00Z') } }
    : options.periodId
    ? await (async () => {
        const period = await prisma.accountingPeriod.findUnique({
          where: { id: options.periodId },
          select: { startDate: true },
        });
        return period ? { transactionDate: { lt: period.startDate } } : {};
      })()
    : {};

  const openingEquityAgg = await aggregateByClass(
    organisationId,
    [AccountClass.EQUITY],
    openingFilter,
  );

  const pnl = await getIncomeStatement(organisationId, options);
  const profitForPeriod = new Prisma.Decimal(pnl.profitForPeriod);

  const movements: Array<{
    accountId: string;
    code: string;
    name: string;
    openingBalance: string;
    movements: string;
    closingBalance: string;
  }> = [];

  let totalOpening = new Prisma.Decimal(0);
  let totalMovements = new Prisma.Decimal(0);
  let totalClosing = new Prisma.Decimal(0);

  for (const acc of equityAccounts) {
    const openingSums = openingEquityAgg.get(acc.id);
    const openingBal = openingSums
      ? openingSums.credit.sub(openingSums.debit)
      : new Prisma.Decimal(0);

    const periodSums = equityAgg.get(acc.id);
    const periodMov = periodSums
      ? periodSums.credit.sub(periodSums.debit)
      : new Prisma.Decimal(0);

    const closingBal = openingBal.add(periodMov);

    totalOpening = totalOpening.add(openingBal);
    totalMovements = totalMovements.add(periodMov);
    totalClosing = totalClosing.add(closingBal);

    movements.push({
      accountId: acc.id,
      code: acc.code,
      name: acc.name,
      openingBalance: openingBal.toFixed(4),
      movements: periodMov.toFixed(4),
      closingBalance: closingBal.toFixed(4),
    });
  }

  // Add retained earnings row (current period P&L flows here before year-end close)
  totalClosing = totalClosing.add(profitForPeriod);

  return {
    organisation: { id: org.id, name: org.name, currency: org.baseCurrency },
    period: {
      fromDate: options.fromDate ?? null,
      toDate: options.toDate ?? null,
      periodId: options.periodId ?? null,
    },
    components: movements,
    profitForPeriod: profitForPeriod.toFixed(4),
    totals: {
      openingEquity: totalOpening.toFixed(4),
      movementsDuringPeriod: totalMovements.toFixed(4),
      closingEquity: totalClosing.toFixed(4),
    },
  };
}
