import { Prisma, AccountClass, AccountType } from '@prisma/client';
import { prisma } from '../../config/database';
import { NotFoundError } from '../../utils/errors';

// ─── Shared low-level types ───────────────────────────────────────────────────

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

// ─── Balance Sheet types (IAS 1 enhanced) ─────────────────────────────────────

export interface BSLine {
  accountId: string;
  code: string;
  name: string;
  type: string;
  level: number;
  current: string;
  prior: string | null;
  change: string | null;
  changePct: string | null;
}

export interface BSGroup {
  label: string;
  lines: BSLine[];
  subtotal: string;
  priorSubtotal: string | null;
  change: string | null;
  changePct: string | null;
}

export interface BSSection {
  label: string;
  groups: BSGroup[];
  subtotal: string;
  priorSubtotal: string | null;
  change: string | null;
  changePct: string | null;
}

export interface BalanceSheetResult {
  organisation: { id: string; name: string; currency: string };
  asOfDate: string;
  priorDate: string | null;
  compareTo: 'prior_period' | 'prior_year' | null;
  assets: {
    nonCurrent: BSSection;
    current: BSSection;
    total: string;
    priorTotal: string | null;
  };
  liabilities: {
    current: BSSection;
    nonCurrent: BSSection;
    total: string;
    priorTotal: string | null;
  };
  equity: {
    section: BSSection;
    retainedEarnings: { label: string; current: string; prior: string | null; change: string | null; changePct: string | null };
    total: string;
    priorTotal: string | null;
  };
  totalLiabilitiesAndEquity: string;
  priorTotalLiabilitiesAndEquity: string | null;
  isBalanced: boolean;
}

// ─── Type → group label mapping ───────────────────────────────────────────────

const GROUP_ORDER_CURRENT_ASSET = [
  'Cash & Cash Equivalents',
  'Trade & Other Receivables',
  'Inventories',
  'Other Current Assets',
];

const GROUP_ORDER_NON_CURRENT_ASSET = [
  'Property, Plant & Equipment',
  'Intangible Assets',
  'Right-of-Use Assets',
  'Equity Investments',
  'Other Non-Current Assets',
];

const GROUP_ORDER_CURRENT_LIAB = [
  'Trade & Other Payables',
  'Tax Liabilities',
  'Short-Term Borrowings',
  'Other Current Liabilities',
];

const GROUP_ORDER_NON_CURRENT_LIAB = [
  'Long-Term Borrowings',
  'Deferred Tax',
  'Other Non-Current Liabilities',
];

const GROUP_ORDER_EQUITY = [
  'Share Capital',
  'Reserves',
  'Other Equity',
];

function accountGroupLabel(type: string, accountClass: AccountClass, subClass: string | null): string {
  const isCurrent = subClass === 'CURRENT';

  if (accountClass === AccountClass.ASSET) {
    if (isCurrent) {
      if (type === 'BANK' || type === 'CASH')                 return 'Cash & Cash Equivalents';
      if (type === 'RECEIVABLE' || type === 'TAX_RECEIVABLE') return 'Trade & Other Receivables';
      if (type === 'INVENTORY')                               return 'Inventories';
      return 'Other Current Assets';
    } else {
      if (type === 'FIXED_ASSET')                             return 'Property, Plant & Equipment';
      if (type === 'INTANGIBLE')                              return 'Intangible Assets';
      if (type === 'RIGHT_OF_USE_ASSET')                      return 'Right-of-Use Assets';
      if (type === 'INTERCOMPANY')                            return 'Equity Investments';
      return 'Other Non-Current Assets';
    }
  }

  if (accountClass === AccountClass.LIABILITY) {
    if (isCurrent) {
      if (type === 'PAYABLE')                                 return 'Trade & Other Payables';
      if (type === 'TAX_PAYABLE')                             return 'Tax Liabilities';
      return 'Other Current Liabilities';
    } else {
      return 'Long-Term Borrowings';
    }
  }

  if (accountClass === AccountClass.EQUITY) {
    if (type === 'EQUITY_ACCOUNT')                            return 'Share Capital';
    return 'Reserves';
  }

  return 'Other';
}

function groupOrder(label: string, sectionType: 'CURRENT_ASSET' | 'NON_CURRENT_ASSET' | 'CURRENT_LIAB' | 'NON_CURRENT_LIAB' | 'EQUITY'): number {
  const lists: Record<string, string[]> = {
    CURRENT_ASSET:     GROUP_ORDER_CURRENT_ASSET,
    NON_CURRENT_ASSET: GROUP_ORDER_NON_CURRENT_ASSET,
    CURRENT_LIAB:      GROUP_ORDER_CURRENT_LIAB,
    NON_CURRENT_LIAB:  GROUP_ORDER_NON_CURRENT_LIAB,
    EQUITY:            GROUP_ORDER_EQUITY,
  };
  const idx = lists[sectionType]?.indexOf(label) ?? -1;
  return idx === -1 ? 99 : idx;
}

// ─── Shared helpers ────────────────────────────────────────────────────────────

async function verifyOrg(organisationId: string) {
  const org = await prisma.organisation.findUnique({
    where: { id: organisationId },
    select: { id: true, name: true, baseCurrency: true },
  });
  if (!org) throw new NotFoundError('Organisation not found');
  return org;
}

type AggMap = Map<string, { debit: Prisma.Decimal; credit: Prisma.Decimal }>;

async function aggregateByClass(
  organisationId: string,
  classes: AccountClass[],
  dateFilter: Prisma.LedgerEntryWhereInput,
): Promise<AggMap> {
  const aggs = await prisma.ledgerEntry.groupBy({
    by: ['accountId'],
    where: { organisationId, account: { class: { in: classes } }, ...dateFilter },
    _sum: { debitAmount: true, creditAmount: true },
  });

  return new Map(
    aggs.map((a) => [
      a.accountId,
      {
        debit:  a._sum.debitAmount  ?? new Prisma.Decimal(0),
        credit: a._sum.creditAmount ?? new Prisma.Decimal(0),
      },
    ]),
  );
}

function netBalance(accountClass: AccountClass, debit: Prisma.Decimal, credit: Prisma.Decimal): Prisma.Decimal {
  const debitNormal = accountClass === AccountClass.ASSET || accountClass === AccountClass.EXPENSE;
  return debitNormal ? debit.sub(credit) : credit.sub(debit);
}

function pctChange(current: Prisma.Decimal, prior: Prisma.Decimal): string | null {
  if (prior.isZero()) return null;
  return current.sub(prior).div(prior.abs()).mul(100).toFixed(1);
}

function buildDateFilter(asOfDate: string): Prisma.LedgerEntryWhereInput {
  return { transactionDate: { lte: new Date(asOfDate + 'T23:59:59Z') } };
}

function buildPeriodFilter(fromDate?: string, toDate?: string, periodId?: string): Prisma.LedgerEntryWhereInput {
  if (periodId) return { periodId };
  return {
    ...(fromDate && { transactionDate: { gte: new Date(fromDate + 'T00:00:00Z') } }),
    ...(toDate   && { transactionDate: { lte: new Date(toDate   + 'T23:59:59Z') } }),
  };
}

// ─── P&L aggregation (for retained earnings line) ─────────────────────────────

async function computeNetPnL(
  organisationId: string,
  dateFilter: Prisma.LedgerEntryWhereInput,
): Promise<Prisma.Decimal> {
  const [revAgg, expAgg] = await Promise.all([
    prisma.ledgerEntry.aggregate({
      where: { organisationId, account: { class: AccountClass.REVENUE }, ...dateFilter },
      _sum: { debitAmount: true, creditAmount: true },
    }),
    prisma.ledgerEntry.aggregate({
      where: { organisationId, account: { class: AccountClass.EXPENSE }, ...dateFilter },
      _sum: { debitAmount: true, creditAmount: true },
    }),
  ]);

  const totalRevenue = (revAgg._sum.creditAmount ?? new Prisma.Decimal(0))
    .sub(revAgg._sum.debitAmount ?? new Prisma.Decimal(0));
  const totalExpense = (expAgg._sum.debitAmount ?? new Prisma.Decimal(0))
    .sub(expAgg._sum.creditAmount ?? new Prisma.Decimal(0));

  return totalRevenue.sub(totalExpense);
}

// ─── Section builder ──────────────────────────────────────────────────────────

type AccountRow = {
  id: string; code: string; name: string;
  class: AccountClass; type: string; subClass: string | null; level: number;
};

function buildBSSection(
  sectionLabel: string,
  sectionType: 'CURRENT_ASSET' | 'NON_CURRENT_ASSET' | 'CURRENT_LIAB' | 'NON_CURRENT_LIAB' | 'EQUITY',
  accounts: AccountRow[],
  currentMap: AggMap,
  priorMap: AggMap | null,
  accountClass: AccountClass,
  showZero: boolean,
): BSSection {
  // Group accounts by type label
  const groupMap = new Map<string, AccountRow[]>();

  for (const acc of accounts) {
    const label = accountGroupLabel(acc.type, accountClass, acc.subClass);
    if (!groupMap.has(label)) groupMap.set(label, []);
    groupMap.get(label)!.push(acc);
  }

  // Sort groups by defined order
  const sortedGroups = [...groupMap.entries()]
    .sort(([a], [b]) => groupOrder(a, sectionType) - groupOrder(b, sectionType));

  let sectionCurrent = new Prisma.Decimal(0);
  let sectionPrior   = priorMap ? new Prisma.Decimal(0) : null;

  const groups: BSGroup[] = [];

  for (const [groupLabel, groupAccounts] of sortedGroups) {
    const lines: BSLine[] = [];
    let groupCurrent = new Prisma.Decimal(0);
    let groupPrior   = priorMap ? new Prisma.Decimal(0) : null;

    for (const acc of groupAccounts.sort((a, b) => a.code.localeCompare(b.code))) {
      const cs = currentMap.get(acc.id);
      const current = cs ? netBalance(accountClass, cs.debit, cs.credit) : new Prisma.Decimal(0);

      let prior: Prisma.Decimal | null = null;
      if (priorMap) {
        const ps = priorMap.get(acc.id);
        prior = ps ? netBalance(accountClass, ps.debit, ps.credit) : new Prisma.Decimal(0);
      }

      if (!showZero && current.isZero() && (prior == null || prior.isZero())) continue;

      const change    = prior != null ? current.sub(prior)               : null;
      const changePct = prior != null ? pctChange(current, prior)        : null;

      lines.push({
        accountId: acc.id,
        code: acc.code,
        name: acc.name,
        type: acc.type,
        level: acc.level,
        current:   current.toFixed(2),
        prior:     prior?.toFixed(2)   ?? null,
        change:    change?.toFixed(2)  ?? null,
        changePct,
      });

      groupCurrent = groupCurrent.add(current);
      if (groupPrior != null && prior != null) groupPrior = groupPrior.add(prior);
    }

    if (!showZero && lines.length === 0) continue;

    const groupChange    = (groupPrior != null) ? groupCurrent.sub(groupPrior)               : null;
    const groupChangePct = (groupPrior != null) ? pctChange(groupCurrent, groupPrior)        : null;

    groups.push({
      label: groupLabel,
      lines,
      subtotal:      groupCurrent.toFixed(2),
      priorSubtotal: groupPrior?.toFixed(2)  ?? null,
      change:        groupChange?.toFixed(2) ?? null,
      changePct:     groupChangePct,
    });

    sectionCurrent = sectionCurrent.add(groupCurrent);
    if (sectionPrior != null && groupPrior != null) sectionPrior = sectionPrior.add(groupPrior);
  }

  const sectionChange    = sectionPrior != null ? sectionCurrent.sub(sectionPrior)        : null;
  const sectionChangePct = sectionPrior != null ? pctChange(sectionCurrent, sectionPrior) : null;

  return {
    label: sectionLabel,
    groups,
    subtotal:      sectionCurrent.toFixed(2),
    priorSubtotal: sectionPrior?.toFixed(2)   ?? null,
    change:        sectionChange?.toFixed(2)  ?? null,
    changePct:     sectionChangePct,
  };
}

// ─── Balance Sheet (IAS 1 Statement of Financial Position) ────────────────────

export interface BalanceSheetOptions {
  asOfDate?: string;
  periodId?: string;
  compareTo?: 'prior_period' | 'prior_year';
  showZero?: boolean;
}

export async function getBalanceSheet(
  organisationId: string,
  options: BalanceSheetOptions = {},
): Promise<BalanceSheetResult> {
  const org = await verifyOrg(organisationId);

  // Determine as-of date (default today)
  const today = new Date().toISOString().slice(0, 10);
  const asOfDate = options.asOfDate ?? today;
  const showZero = options.showZero ?? false;

  // Determine prior date for comparison
  let priorDate: string | null = null;
  if (options.compareTo === 'prior_period') {
    const d = new Date(asOfDate + 'T00:00:00Z');
    d.setMonth(d.getMonth() - 1);
    priorDate = d.toISOString().slice(0, 10);
  } else if (options.compareTo === 'prior_year') {
    const d = new Date(asOfDate + 'T00:00:00Z');
    d.setFullYear(d.getFullYear() - 1);
    priorDate = d.toISOString().slice(0, 10);
  }

  const currentFilter = buildDateFilter(asOfDate);
  const priorFilter   = priorDate ? buildDateFilter(priorDate) : null;

  // Aggregate all classes for current and prior
  const [
    currentAssetAgg, currentLiabAgg, currentEquityAgg,
    priorAssetAgg,   priorLiabAgg,   priorEquityAgg,
    currentPnL,      priorPnL,
  ] = await Promise.all([
    aggregateByClass(organisationId, [AccountClass.ASSET],     currentFilter),
    aggregateByClass(organisationId, [AccountClass.LIABILITY],  currentFilter),
    aggregateByClass(organisationId, [AccountClass.EQUITY],     currentFilter),
    priorFilter ? aggregateByClass(organisationId, [AccountClass.ASSET],     priorFilter) : Promise.resolve<AggMap>(new Map()),
    priorFilter ? aggregateByClass(organisationId, [AccountClass.LIABILITY],  priorFilter) : Promise.resolve<AggMap>(new Map()),
    priorFilter ? aggregateByClass(organisationId, [AccountClass.EQUITY],     priorFilter) : Promise.resolve<AggMap>(new Map()),
    computeNetPnL(organisationId, currentFilter),
    priorFilter ? computeNetPnL(organisationId, priorFilter) : Promise.resolve<Prisma.Decimal | null>(null),
  ]);

  // Get all accounts with balances
  const allCurrentIds = [
    ...currentAssetAgg.keys(), ...currentLiabAgg.keys(), ...currentEquityAgg.keys(),
  ];
  const allPriorIds = priorFilter
    ? [...priorAssetAgg.keys(), ...priorLiabAgg.keys(), ...priorEquityAgg.keys()]
    : [];
  const allAccountIds = [...new Set([...allCurrentIds, ...allPriorIds])];

  const accounts = allAccountIds.length === 0 ? [] : await prisma.account.findMany({
    where: { id: { in: allAccountIds }, organisationId, isDeleted: false },
    select: { id: true, code: true, name: true, class: true, subClass: true, type: true, level: true },
    orderBy: { code: 'asc' },
  });

  const assetAccounts  = accounts.filter((a) => a.class === AccountClass.ASSET);
  const liabAccounts   = accounts.filter((a) => a.class === AccountClass.LIABILITY);
  const equityAccounts = accounts.filter((a) => a.class === AccountClass.EQUITY);

  // Classify current vs non-current (subClass = 'CURRENT' or fallback by type)
  const isCurrentAsset = (a: typeof accounts[0]) =>
    a.subClass === 'CURRENT' || a.type === 'BANK' || a.type === 'CASH' ||
    a.type === 'RECEIVABLE' || a.type === 'TAX_RECEIVABLE' || a.type === 'INVENTORY';

  const isCurrentLiab = (a: typeof accounts[0]) =>
    a.subClass === 'CURRENT' || a.type === 'PAYABLE' || a.type === 'TAX_PAYABLE';

  const priorAssetMapOrNull   = priorFilter ? priorAssetAgg   : null;
  const priorLiabMapOrNull    = priorFilter ? priorLiabAgg    : null;
  const priorEquityMapOrNull  = priorFilter ? priorEquityAgg  : null;

  // Build the four main sections
  const nonCurrentAssetsSection = buildBSSection(
    'Non-Current Assets', 'NON_CURRENT_ASSET',
    assetAccounts.filter((a) => !isCurrentAsset(a)),
    currentAssetAgg, priorAssetMapOrNull, AccountClass.ASSET, showZero,
  );

  const currentAssetsSection = buildBSSection(
    'Current Assets', 'CURRENT_ASSET',
    assetAccounts.filter(isCurrentAsset),
    currentAssetAgg, priorAssetMapOrNull, AccountClass.ASSET, showZero,
  );

  const currentLiabSection = buildBSSection(
    'Current Liabilities', 'CURRENT_LIAB',
    liabAccounts.filter(isCurrentLiab),
    currentLiabAgg, priorLiabMapOrNull, AccountClass.LIABILITY, showZero,
  );

  const nonCurrentLiabSection = buildBSSection(
    'Non-Current Liabilities', 'NON_CURRENT_LIAB',
    liabAccounts.filter((a) => !isCurrentLiab(a)),
    currentLiabAgg, priorLiabMapOrNull, AccountClass.LIABILITY, showZero,
  );

  const equitySection = buildBSSection(
    'Equity', 'EQUITY',
    equityAccounts,
    currentEquityAgg, priorEquityMapOrNull, AccountClass.EQUITY, showZero,
  );

  // Totals
  const totalCurrentAssets    = new Prisma.Decimal(nonCurrentAssetsSection.subtotal).add(new Prisma.Decimal(currentAssetsSection.subtotal));
  const totalCurrentLiab      = new Prisma.Decimal(currentLiabSection.subtotal);
  const totalNonCurrentLiab   = new Prisma.Decimal(nonCurrentLiabSection.subtotal);
  const totalLiab             = totalCurrentLiab.add(totalNonCurrentLiab);
  const totalEquityAccounts   = new Prisma.Decimal(equitySection.subtotal);
  const totalEquity           = totalEquityAccounts.add(currentPnL);

  const totalAssets           = totalCurrentAssets;
  const totalLiabAndEquity    = totalLiab.add(totalEquity);

  // Prior totals
  const priorTotalNCA = priorFilter ? (nonCurrentAssetsSection.priorSubtotal ?? '0') : null;
  const priorTotalCA  = priorFilter ? (currentAssetsSection.priorSubtotal    ?? '0') : null;
  const priorTotalAssets = (priorTotalNCA != null && priorTotalCA != null)
    ? new Prisma.Decimal(priorTotalNCA).add(new Prisma.Decimal(priorTotalCA)).toFixed(2)
    : null;

  const priorTotalCL  = priorFilter ? (currentLiabSection.priorSubtotal    ?? '0') : null;
  const priorTotalNCL = priorFilter ? (nonCurrentLiabSection.priorSubtotal ?? '0') : null;
  const priorTotalLiab = (priorTotalCL != null && priorTotalNCL != null)
    ? new Prisma.Decimal(priorTotalCL).add(new Prisma.Decimal(priorTotalNCL)).toFixed(2)
    : null;

  const priorTotalEquityAccounts = priorFilter ? (equitySection.priorSubtotal ?? '0') : null;
  const priorTotalEquity = (priorTotalEquityAccounts != null && priorPnL != null)
    ? new Prisma.Decimal(priorTotalEquityAccounts).add(priorPnL).toFixed(2)
    : null;

  const priorTotalLiabAndEquity = (priorTotalLiab != null && priorTotalEquity != null)
    ? new Prisma.Decimal(priorTotalLiab).add(new Prisma.Decimal(priorTotalEquity)).toFixed(2)
    : null;

  // Retained earnings / current year P&L line
  const retainedChange    = priorPnL != null ? currentPnL.sub(priorPnL).toFixed(2)               : null;
  const retainedChangePct = priorPnL != null ? pctChange(currentPnL, priorPnL)                   : null;

  return {
    organisation: { id: org.id, name: org.name, currency: org.baseCurrency },
    asOfDate,
    priorDate,
    compareTo: options.compareTo ?? null,

    assets: {
      nonCurrent:  nonCurrentAssetsSection,
      current:     currentAssetsSection,
      total:       totalAssets.toFixed(2),
      priorTotal:  priorTotalAssets,
    },

    liabilities: {
      current:    currentLiabSection,
      nonCurrent: nonCurrentLiabSection,
      total:      totalLiab.toFixed(2),
      priorTotal: priorTotalLiab,
    },

    equity: {
      section: equitySection,
      retainedEarnings: {
        label:     'Current Year Profit / (Loss)',
        current:   currentPnL.toFixed(2),
        prior:     priorPnL?.toFixed(2) ?? null,
        change:    retainedChange,
        changePct: retainedChangePct,
      },
      total:      totalEquity.toFixed(2),
      priorTotal: priorTotalEquity,
    },

    totalLiabilitiesAndEquity:      totalLiabAndEquity.toFixed(2),
    priorTotalLiabilitiesAndEquity: priorTotalLiabAndEquity,
    isBalanced: totalAssets.toFixed(2) === totalLiabAndEquity.toFixed(2),
  };
}

// ─── Balance Sheet drill-down (account-level transactions) ───────────────────

export async function getBalanceSheetDrilldown(
  organisationId: string,
  accountId: string,
  asOfDate: string,
) {
  const account = await prisma.account.findFirst({
    where: { id: accountId, organisationId, isDeleted: false },
    select: { id: true, code: true, name: true, class: true, type: true },
  });
  if (!account) throw new NotFoundError('Account not found');

  const entries = await prisma.ledgerEntry.findMany({
    where: {
      organisationId,
      accountId,
      transactionDate: { lte: new Date(asOfDate + 'T23:59:59Z') },
    },
    orderBy: { transactionDate: 'desc' },
    take: 100,
    include: {
      journalEntry: {
        select: { journalNumber: true, description: true, type: true, status: true, reference: true },
      },
    },
  });

  // Running total
  const totalDebit  = entries.reduce((s, e) => s.add(e.debitAmount),  new Prisma.Decimal(0));
  const totalCredit = entries.reduce((s, e) => s.add(e.creditAmount), new Prisma.Decimal(0));
  const netBal      = netBalance(account.class, totalDebit, totalCredit);

  return {
    account: { id: account.id, code: account.code, name: account.name },
    asOfDate,
    closingBalance: netBal.toFixed(2),
    entryCount: entries.length,
    entries: entries.map((e) => ({
      id:             e.id,
      transactionDate: e.transactionDate.toISOString().slice(0, 10),
      description:    e.description,
      debitAmount:    e.debitAmount.toFixed(2),
      creditAmount:   e.creditAmount.toFixed(2),
      runningBalance: e.runningBalance.toFixed(2),
      journal: {
        journalNumber: e.journalEntry?.journalNumber ?? null,
        description:   e.journalEntry?.description   ?? null,
        type:          e.journalEntry?.type          ?? null,
        reference:     e.journalEntry?.reference     ?? null,
      },
    })),
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
    revenueIds.length ? prisma.account.findMany({
      where: { id: { in: revenueIds }, organisationId, isDeleted: false },
      select: { id: true, code: true, name: true, class: true, subClass: true, type: true, level: true },
      orderBy: { code: 'asc' },
    }) : [],
    expenseIds.length ? prisma.account.findMany({
      where: { id: { in: expenseIds }, organisationId, isDeleted: false },
      select: { id: true, code: true, name: true, class: true, subClass: true, type: true, level: true },
      orderBy: { code: 'asc' },
    }) : [],
  ]);

  function toSection(label: string, accs: typeof revenueAccounts, agg: AggMap, cls: AccountClass): StatementSection {
    const lines: StatementLine[] = [];
    let subtotal = new Prisma.Decimal(0);
    for (const acc of accs) {
      const s = agg.get(acc.id);
      if (!s) continue;
      const bal = netBalance(cls, s.debit, s.credit);
      if (bal.isZero()) continue;
      lines.push({ accountId: acc.id, code: acc.code, name: acc.name, class: acc.class, type: acc.type, subClass: acc.subClass, level: acc.level, balance: bal.toFixed(2) });
      subtotal = subtotal.add(bal);
    }
    return { label, lines, subtotal: subtotal.toFixed(2) };
  }

  const revenueSection = toSection('Revenue', revenueAccounts, revenueAgg, AccountClass.REVENUE);
  const cogs  = expenseAccounts.filter((a) => a.type === AccountType.COST_OF_SALES);
  const opex  = expenseAccounts.filter((a) => a.type !== AccountType.COST_OF_SALES);

  const cogsSection = toSection('Cost of Sales', cogs, expenseAgg, AccountClass.EXPENSE);
  const opexSection = toSection('Operating Expenses', opex, expenseAgg, AccountClass.EXPENSE);

  const totalRevenue = new Prisma.Decimal(revenueSection.subtotal);
  const totalCogs    = new Prisma.Decimal(cogsSection.subtotal);
  const grossProfit  = totalRevenue.sub(totalCogs);
  const totalOpex    = new Prisma.Decimal(opexSection.subtotal);
  const profitForPeriod = grossProfit.sub(totalOpex);

  return {
    organisation: { id: org.id, name: org.name, currency: org.baseCurrency },
    period: { fromDate: options.fromDate ?? null, toDate: options.toDate ?? null, periodId: options.periodId ?? null },
    revenue: revenueSection,
    costOfSales: cogsSection,
    grossProfit: grossProfit.toFixed(2),
    operatingExpenses: opexSection,
    profitForPeriod: profitForPeriod.toFixed(2),
  };
}

// ─── Cash Flow Statement (IAS 7 — Indirect Method) ───────────────────────────

export interface CashFlowOptions {
  fromDate?: string;
  toDate?: string;
  periodId?: string;
}

export async function getCashFlowStatement(organisationId: string, options: CashFlowOptions = {}) {
  const org    = await verifyOrg(organisationId);
  const periodFilter = buildPeriodFilter(options.fromDate, options.toDate, options.periodId);

  const pnl       = await getIncomeStatement(organisationId, options);
  const netProfit = new Prisma.Decimal(pnl.profitForPeriod);

  const aggs = await prisma.ledgerEntry.groupBy({
    by: ['accountId'],
    where: { organisationId, ...periodFilter },
    _sum: { debitAmount: true, creditAmount: true },
  });

  const accountIds = aggs.map((a) => a.accountId);
  const accounts   = accountIds.length ? await prisma.account.findMany({
    where: { id: { in: accountIds }, organisationId, isDeleted: false },
    select: { id: true, code: true, name: true, class: true, subClass: true, type: true },
  }) : [];

  const aggMap: AggMap = new Map(
    aggs.map((a) => [a.accountId, {
      debit:  a._sum.debitAmount  ?? new Prisma.Decimal(0),
      credit: a._sum.creditAmount ?? new Prisma.Decimal(0),
    }]),
  );

  const operatingAdjustments: StatementLine[] = [];
  let totalOperatingAdjustments = new Prisma.Decimal(0);
  const investingItems:  StatementLine[] = [];
  let totalInvesting = new Prisma.Decimal(0);
  const financingItems:  StatementLine[] = [];
  let totalFinancing = new Prisma.Decimal(0);

  for (const acc of accounts) {
    const sums = aggMap.get(acc.id)!;
    const isCash = acc.type === AccountType.CASH || acc.type === AccountType.BANK;

    if (acc.class === AccountClass.ASSET && (acc.subClass === 'CURRENT') && !isCash) {
      const change = sums.debit.sub(sums.credit).neg();
      if (!change.isZero()) {
        operatingAdjustments.push({ accountId: acc.id, code: acc.code, name: `Change in ${acc.name}`, class: acc.class, type: acc.type, subClass: acc.subClass, level: 1, balance: change.toFixed(2) });
        totalOperatingAdjustments = totalOperatingAdjustments.add(change);
      }
    } else if (acc.class === AccountClass.LIABILITY && acc.subClass === 'CURRENT') {
      const change = sums.credit.sub(sums.debit);
      if (!change.isZero()) {
        operatingAdjustments.push({ accountId: acc.id, code: acc.code, name: `Change in ${acc.name}`, class: acc.class, type: acc.type, subClass: acc.subClass, level: 1, balance: change.toFixed(2) });
        totalOperatingAdjustments = totalOperatingAdjustments.add(change);
      }
    } else if (acc.class === AccountClass.ASSET && acc.subClass !== 'CURRENT') {
      const change = sums.debit.sub(sums.credit).neg();
      if (!change.isZero()) {
        investingItems.push({ accountId: acc.id, code: acc.code, name: acc.name, class: acc.class, type: acc.type, subClass: acc.subClass, level: 1, balance: change.toFixed(2) });
        totalInvesting = totalInvesting.add(change);
      }
    } else if (acc.class === AccountClass.LIABILITY && acc.subClass !== 'CURRENT') {
      const change = sums.credit.sub(sums.debit);
      if (!change.isZero()) {
        financingItems.push({ accountId: acc.id, code: acc.code, name: acc.name, class: acc.class, type: acc.type, subClass: acc.subClass, level: 1, balance: change.toFixed(2) });
        totalFinancing = totalFinancing.add(change);
      }
    } else if (acc.class === AccountClass.EQUITY) {
      const change = sums.credit.sub(sums.debit);
      if (!change.isZero()) {
        financingItems.push({ accountId: acc.id, code: acc.code, name: acc.name, class: acc.class, type: acc.type, subClass: acc.subClass, level: 1, balance: change.toFixed(2) });
        totalFinancing = totalFinancing.add(change);
      }
    }
  }

  const netCashFromOperating = netProfit.add(totalOperatingAdjustments);
  const cashAccountIds = accounts.filter((a) => a.type === AccountType.CASH || a.type === AccountType.BANK).map((a) => a.id);

  let openingCash = new Prisma.Decimal(0);
  if (cashAccountIds.length > 0) {
    const openingFilter: Prisma.LedgerEntryWhereInput = options.fromDate
      ? { transactionDate: { lt: new Date(options.fromDate + 'T00:00:00Z') } }
      : options.periodId ? await (async () => {
          const p = await prisma.accountingPeriod.findUnique({ where: { id: options.periodId }, select: { startDate: true } });
          return p ? { transactionDate: { lt: p.startDate } } : {};
        })() : {};
    if (Object.keys(openingFilter).length > 0) {
      const openingAgg = await prisma.ledgerEntry.aggregate({
        where: { organisationId, accountId: { in: cashAccountIds }, ...openingFilter },
        _sum: { debitAmount: true, creditAmount: true },
      });
      openingCash = (openingAgg._sum.debitAmount ?? new Prisma.Decimal(0)).sub(openingAgg._sum.creditAmount ?? new Prisma.Decimal(0));
    }
  }

  const netChange   = netCashFromOperating.add(totalInvesting).add(totalFinancing);
  const closingCash = openingCash.add(netChange);

  return {
    organisation: { id: org.id, name: org.name, currency: org.baseCurrency },
    period: { fromDate: options.fromDate ?? null, toDate: options.toDate ?? null, periodId: options.periodId ?? null },
    operatingActivities: { netProfit: netProfit.toFixed(2), workingCapitalAdjustments: operatingAdjustments, totalAdjustments: totalOperatingAdjustments.toFixed(2), netCashFromOperating: netCashFromOperating.toFixed(2) },
    investingActivities: { items: investingItems, netCashFromInvesting: totalInvesting.toFixed(2) },
    financingActivities: { items: financingItems, netCashFromFinancing: totalFinancing.toFixed(2) },
    netChangeInCash: netChange.toFixed(2),
    openingCashBalance: openingCash.toFixed(2),
    closingCashBalance: closingCash.toFixed(2),
  };
}

// ─── Statement of Changes in Equity (IAS 1) ──────────────────────────────────

export interface ChangesInEquityOptions {
  fromDate?: string;
  toDate?: string;
  periodId?: string;
}

export async function getChangesInEquity(organisationId: string, options: ChangesInEquityOptions = {}) {
  const org = await verifyOrg(organisationId);
  const periodFilter = buildPeriodFilter(options.fromDate, options.toDate, options.periodId);

  const equityAgg = await aggregateByClass(organisationId, [AccountClass.EQUITY], periodFilter);
  const equityIds = [...equityAgg.keys()];
  const equityAccounts = equityIds.length ? await prisma.account.findMany({
    where: { id: { in: equityIds }, organisationId, isDeleted: false },
    select: { id: true, code: true, name: true, class: true, subClass: true, type: true, level: true },
    orderBy: { code: 'asc' },
  }) : [];

  const openingFilter: Prisma.LedgerEntryWhereInput = options.fromDate
    ? { transactionDate: { lt: new Date(options.fromDate + 'T00:00:00Z') } }
    : options.periodId ? await (async () => {
        const p = await prisma.accountingPeriod.findUnique({ where: { id: options.periodId }, select: { startDate: true } });
        return p ? { transactionDate: { lt: p.startDate } } : {};
      })() : {};

  const openingEquityAgg = await aggregateByClass(organisationId, [AccountClass.EQUITY], openingFilter);
  const pnl = await getIncomeStatement(organisationId, options);
  const profitForPeriod = new Prisma.Decimal(pnl.profitForPeriod);

  let totalOpening = new Prisma.Decimal(0);
  let totalMovements = new Prisma.Decimal(0);
  let totalClosing = new Prisma.Decimal(0);

  const movements = equityAccounts.map((acc) => {
    const openingSums = openingEquityAgg.get(acc.id);
    const openingBal  = openingSums ? openingSums.credit.sub(openingSums.debit) : new Prisma.Decimal(0);
    const periodSums  = equityAgg.get(acc.id);
    const periodMov   = periodSums ? periodSums.credit.sub(periodSums.debit) : new Prisma.Decimal(0);
    const closingBal  = openingBal.add(periodMov);
    totalOpening    = totalOpening.add(openingBal);
    totalMovements  = totalMovements.add(periodMov);
    totalClosing    = totalClosing.add(closingBal);
    return { accountId: acc.id, code: acc.code, name: acc.name, openingBalance: openingBal.toFixed(2), movements: periodMov.toFixed(2), closingBalance: closingBal.toFixed(2) };
  });

  totalClosing = totalClosing.add(profitForPeriod);

  return {
    organisation: { id: org.id, name: org.name, currency: org.baseCurrency },
    period: { fromDate: options.fromDate ?? null, toDate: options.toDate ?? null, periodId: options.periodId ?? null },
    components: movements,
    profitForPeriod: profitForPeriod.toFixed(2),
    totals: { openingEquity: totalOpening.toFixed(2), movementsDuringPeriod: totalMovements.toFixed(2), closingEquity: totalClosing.toFixed(2) },
  };
}
