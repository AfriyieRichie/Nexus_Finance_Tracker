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

// ─── Income Statement types (IAS 1 enhanced) ─────────────────────────────────

export interface ISLine {
  accountId: string;
  code: string;
  name: string;
  type: string;
  subClass: string | null;
  current: string;
  ytd: string;
  priorPeriod: string | null;
  priorYear: string | null;
  pctOfRevenue: string | null;
}

export interface ISGroup {
  label: string;
  lines: ISLine[];
  subtotal: string;
  ytdSubtotal: string;
  priorPeriodSubtotal: string | null;
  priorYearSubtotal: string | null;
  pctOfRevenue: string | null;
}

export interface ISSection {
  label: string;
  groups: ISGroup[];
  subtotal: string;
  ytdSubtotal: string;
  priorPeriodSubtotal: string | null;
  priorYearSubtotal: string | null;
  pctOfRevenue: string | null;
}

export interface ISSubtotalLine {
  label: string;
  current: string;
  ytd: string;
  priorPeriod: string | null;
  priorYear: string | null;
  pctOfRevenue: string | null;
}

export interface IncomeStatementResult {
  organisation: { id: string; name: string; currency: string };
  period: {
    fromDate: string;
    toDate: string;
    ytdFromDate: string;
    priorPeriodFromDate: string | null;
    priorPeriodToDate: string | null;
    priorYearFromDate: string | null;
    priorYearToDate: string | null;
    comparisons: ('prior_period' | 'prior_year')[];
  };
  revenue: ISSection;
  costOfSales: ISSection;
  grossProfit: ISSubtotalLine;
  grossMarginPct: { current: string; ytd: string };
  operatingExpenses: ISSection;
  depreciationAmortisation: ISSubtotalLine;
  ebitda: ISSubtotalLine;
  ebitdaMarginPct: { current: string; ytd: string };
  operatingProfit: ISSubtotalLine;
  operatingMarginPct: { current: string; ytd: string };
  exceptionalItems: ISSection | null;
  financeIncome: ISSection | null;
  financeCosts: ISSection | null;
  netFinanceItems: ISSubtotalLine;
  profitBeforeTax: ISSubtotalLine;
  taxExpense: ISSection | null;
  profitForPeriodLine: ISSubtotalLine;
  netMarginPct: { current: string; ytd: string };
  // backward-compat for getCashFlowStatement / getChangesInEquity
  profitForPeriod: string;
}

// ─── IS classification helpers ────────────────────────────────────────────────

function isDA(subClass: string | null, name: string): boolean {
  const sc = (subClass ?? '').toUpperCase();
  const nm = name.toLowerCase();
  return sc.includes('DEPR') || sc.includes('AMORT') ||
    nm.includes('depreciation') || nm.includes('amortisation') || nm.includes('amortization');
}

function isFinanceCostAccount(subClass: string | null, name: string): boolean {
  const sc = (subClass ?? '').toUpperCase();
  const nm = name.toLowerCase();
  return sc.includes('FINANCE_COST') || sc.includes('INTEREST_EXPENSE') || sc.includes('BORROWING_COST') ||
    nm.includes('interest expense') || nm.includes('finance cost') || nm.includes('finance charge') ||
    nm.includes('bank charge') || nm.includes('loan interest');
}

function isFinanceIncomeAccount(subClass: string | null, name: string): boolean {
  const sc = (subClass ?? '').toUpperCase();
  const nm = name.toLowerCase();
  return sc.includes('FINANCE_INCOME') || sc.includes('INTEREST_INCOME') || sc.includes('INVESTMENT_INCOME') ||
    nm.includes('interest income') || nm.includes('finance income') || nm.includes('investment income') ||
    nm.includes('dividend income');
}

function isTaxAccount(subClass: string | null, name: string): boolean {
  const sc = (subClass ?? '').toUpperCase();
  const nm = name.toLowerCase();
  return sc.includes('INCOME_TAX') || sc.includes('CORPORATE_TAX') || sc.includes('TAX_EXPENSE') ||
    nm.includes('income tax expense') || nm.includes('corporate tax') || nm.includes('tax expense');
}

function isExceptionalAccount(subClass: string | null, name: string): boolean {
  const sc = (subClass ?? '').toUpperCase();
  const nm = name.toLowerCase();
  return sc.includes('EXCEPTIONAL') || sc.includes('EXTRAORDINARY') || sc.includes('ONE_OFF') ||
    nm.includes('exceptional') || nm.includes('extraordinary') || nm.includes('impairment loss') ||
    nm.includes('restructuring charge');
}

function revenueGroupLabel(subClass: string | null, _type: string, name: string): string {
  const sc = (subClass ?? '').toUpperCase();
  const nm = name.toLowerCase();
  if (sc.includes('PRODUCT') || sc.includes('GOODS') || sc.includes('SALES') || nm.includes('product') || nm.includes('goods')) return 'Product & Goods Revenue';
  if (sc.includes('SERVICE') || sc.includes('CONSULT') || sc.includes('PROFESSIONAL')) return 'Service Revenue';
  if (sc.includes('RENTAL') || sc.includes('LEASE') || nm.includes('rental') || nm.includes('lease')) return 'Rental & Lease Income';
  if (sc.includes('OTHER') || sc.includes('MISC')) return 'Other Operating Income';
  return 'Operating Revenue';
}

function expenseGroupLabel(subClass: string | null, name: string): string {
  const sc = (subClass ?? '').toUpperCase();
  if (sc.includes('STAFF') || sc.includes('SALARY') || sc.includes('PAYROLL') || sc.includes('WAGES') || sc.includes('EMPLOYEE') || sc.includes('HR')) return 'Staff Costs & Benefits';
  if (isDA(subClass, name)) return 'Depreciation & Amortisation';
  if (sc.includes('MARKETING') || sc.includes('DISTRIBUTION') || sc.includes('SELLING') || sc.includes('ADVERTISING')) return 'Selling & Distribution';
  if (sc.includes('ADMIN') || sc.includes('GENERAL') || sc.includes('OVERHEAD')) return 'Administrative Expenses';
  if (sc.includes('MATERIAL') || sc.includes('CONSUMABLE') || sc.includes('SUPPLY')) return 'Materials & Consumables';
  if (sc.includes('UTILITY') || sc.includes('RENT') || sc.includes('OCCUPANCY') || sc.includes('LEASE_EXPENSE')) return 'Occupancy & Utilities';
  if (sc.includes('IT') || sc.includes('TECHNOLOGY') || sc.includes('SOFTWARE')) return 'IT & Technology';
  if (sc.includes('PROFESSIONAL') || sc.includes('LEGAL') || sc.includes('AUDIT') || sc.includes('CONSULT')) return 'Professional Services';
  return 'Other Operating Expenses';
}

const IS_REVENUE_ORDER = [
  'Product & Goods Revenue',
  'Service Revenue',
  'Rental & Lease Income',
  'Operating Revenue',
  'Other Operating Income',
];

const IS_OPEX_ORDER = [
  'Staff Costs & Benefits',
  'Materials & Consumables',
  'Selling & Distribution',
  'Occupancy & Utilities',
  'IT & Technology',
  'Professional Services',
  'Administrative Expenses',
  'Depreciation & Amortisation',
  'Other Operating Expenses',
];

// ─── IS section builder ───────────────────────────────────────────────────────

type ISAccountRow = { id: string; code: string; name: string; class: AccountClass; type: string; subClass: string | null };

interface ISMaps {
  current: AggMap; ytd: AggMap;
  pp: AggMap | null; py: AggMap | null;
}

function buildISSection(
  sectionLabel: string,
  accounts: ISAccountRow[],
  groupLabelFn: (subClass: string | null, type: string, name: string) => string,
  groupOrder: string[],
  accountClass: AccountClass,
  maps: ISMaps,
  showZero: boolean,
  totalRevCurrent: Prisma.Decimal,
): ISSection {
  const groupMap = new Map<string, ISAccountRow[]>();
  for (const acc of accounts) {
    const label = groupLabelFn(acc.subClass, acc.type, acc.name);
    if (!groupMap.has(label)) groupMap.set(label, []);
    groupMap.get(label)!.push(acc);
  }

  const sortedGroups = [...groupMap.entries()].sort(([a], [b]) => {
    const ai = groupOrder.indexOf(a), bi = groupOrder.indexOf(b);
    return (ai === -1 ? groupOrder.length : ai) - (bi === -1 ? groupOrder.length : bi);
  });

  let secCurrent = new Prisma.Decimal(0);
  let secYtd     = new Prisma.Decimal(0);
  let secPP: Prisma.Decimal | null = maps.pp ? new Prisma.Decimal(0) : null;
  let secPY: Prisma.Decimal | null = maps.py ? new Prisma.Decimal(0) : null;

  const groups: ISGroup[] = [];

  for (const [groupLabel, groupAccounts] of sortedGroups) {
    const lines: ISLine[] = [];
    let gCur = new Prisma.Decimal(0), gYtd = new Prisma.Decimal(0);
    let gPP: Prisma.Decimal | null = maps.pp ? new Prisma.Decimal(0) : null;
    let gPY: Prisma.Decimal | null = maps.py ? new Prisma.Decimal(0) : null;

    for (const acc of groupAccounts.sort((a, b) => a.code.localeCompare(b.code))) {
      const get = (agg: AggMap | null) => {
        if (!agg) return null;
        const s = agg.get(acc.id);
        return s ? netBalance(accountClass, s.debit, s.credit) : new Prisma.Decimal(0);
      };
      const cur = get(maps.current)!;
      const ytd = get(maps.ytd)!;
      const pp  = get(maps.pp);
      const py  = get(maps.py);

      if (!showZero && cur.isZero() && ytd.isZero() && (pp == null || pp.isZero()) && (py == null || py.isZero())) continue;

      const pctOfRevenue = !totalRevCurrent.isZero()
        ? cur.div(totalRevCurrent.abs()).mul(100).toFixed(1) : null;

      lines.push({ accountId: acc.id, code: acc.code, name: acc.name, type: acc.type, subClass: acc.subClass, current: cur.toFixed(2), ytd: ytd.toFixed(2), priorPeriod: pp?.toFixed(2) ?? null, priorYear: py?.toFixed(2) ?? null, pctOfRevenue });
      gCur = gCur.add(cur); gYtd = gYtd.add(ytd);
      if (gPP != null && pp != null) gPP = gPP.add(pp);
      if (gPY != null && py != null) gPY = gPY.add(py);
    }

    if (!lines.length) continue;

    const gPct = !totalRevCurrent.isZero() ? gCur.div(totalRevCurrent.abs()).mul(100).toFixed(1) : null;
    groups.push({ label: groupLabel, lines, subtotal: gCur.toFixed(2), ytdSubtotal: gYtd.toFixed(2), priorPeriodSubtotal: gPP?.toFixed(2) ?? null, priorYearSubtotal: gPY?.toFixed(2) ?? null, pctOfRevenue: gPct });
    secCurrent = secCurrent.add(gCur); secYtd = secYtd.add(gYtd);
    if (secPP != null && gPP != null) secPP = secPP.add(gPP);
    if (secPY != null && gPY != null) secPY = secPY.add(gPY);
  }

  const secPct = !totalRevCurrent.isZero() ? secCurrent.div(totalRevCurrent.abs()).mul(100).toFixed(1) : null;
  return { label: sectionLabel, groups, subtotal: secCurrent.toFixed(2), ytdSubtotal: secYtd.toFixed(2), priorPeriodSubtotal: secPP?.toFixed(2) ?? null, priorYearSubtotal: secPY?.toFixed(2) ?? null, pctOfRevenue: secPct };
}

function makeISSubtotal(
  label: string,
  current: Prisma.Decimal, ytd: Prisma.Decimal,
  pp: Prisma.Decimal | null, py: Prisma.Decimal | null,
  totalRevCurrent: Prisma.Decimal,
): ISSubtotalLine {
  const pctOfRevenue = !totalRevCurrent.isZero() ? current.div(totalRevCurrent.abs()).mul(100).toFixed(1) : null;
  return { label, current: current.toFixed(2), ytd: ytd.toFixed(2), priorPeriod: pp?.toFixed(2) ?? null, priorYear: py?.toFixed(2) ?? null, pctOfRevenue };
}

function marginPct(numerator: Prisma.Decimal, denominator: Prisma.Decimal): string {
  if (denominator.isZero()) return '0.0';
  return numerator.div(denominator.abs()).mul(100).toFixed(1);
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
  // subClass === 'CURRENT' is an optional override; for core types the type itself
  // is authoritative — BANK is always cash, PAYABLE is always trade payable, etc.
  const isCurrent = subClass === 'CURRENT';

  if (accountClass === AccountClass.ASSET) {
    // These types are inherently current — no subClass needed
    if (type === 'BANK' || type === 'CASH')                   return 'Cash & Cash Equivalents';
    if (type === 'INVENTORY')                                 return 'Inventories';
    if (type === 'RECEIVABLE' || type === 'TAX_RECEIVABLE')   return 'Trade & Other Receivables';
    // Non-current asset types
    if (type === 'FIXED_ASSET')                               return 'Property, Plant & Equipment';
    if (type === 'INTANGIBLE')                                return 'Intangible Assets';
    if (type === 'RIGHT_OF_USE_ASSET')                        return 'Right-of-Use Assets';
    if (type === 'INTERCOMPANY')                              return 'Equity Investments';
    // OTHER falls back to subClass
    return isCurrent ? 'Other Current Assets' : 'Other Non-Current Assets';
  }

  if (accountClass === AccountClass.LIABILITY) {
    // PAYABLE and TAX_PAYABLE are inherently current trade liabilities
    if (type === 'PAYABLE')                                   return 'Trade & Other Payables';
    if (type === 'TAX_PAYABLE')                               return 'Tax Liabilities';
    return isCurrent ? 'Other Current Liabilities' : 'Long-Term Borrowings';
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

async function aggregateForCFS(
  organisationId: string,
  dateFilter: Prisma.LedgerEntryWhereInput,
  accountIds?: string[],
): Promise<AggMap> {
  const aggs = await prisma.ledgerEntry.groupBy({
    by: ['accountId'],
    where: {
      organisationId,
      ...dateFilter,
      ...(accountIds && accountIds.length > 0 ? { accountId: { in: accountIds } } : {}),
    },
    _sum: { debitAmount: true, creditAmount: true },
  });
  return new Map(aggs.map((a) => [a.accountId, {
    debit:  a._sum.debitAmount  ?? new Prisma.Decimal(0),
    credit: a._sum.creditAmount ?? new Prisma.Decimal(0),
  }]));
}

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
  comparisons?: ('prior_period' | 'prior_year')[];
  showZero?: boolean;
}

export async function getIncomeStatement(
  organisationId: string,
  options: IncomeStatementOptions = {},
): Promise<IncomeStatementResult> {
  const org = await verifyOrg(organisationId);

  const today      = new Date().toISOString().slice(0, 10);
  const toDate     = options.toDate   ?? today;
  const fromDate   = options.fromDate ?? `${toDate.slice(0, 4)}-01-01`;
  const ytdFrom    = `${toDate.slice(0, 4)}-01-01`;
  const showZero   = options.showZero ?? false;
  const comparisons = options.comparisons ?? [];
  const hasPP      = comparisons.includes('prior_period');
  const hasPY      = comparisons.includes('prior_year');

  // Prior-period: same duration ending the day before fromDate
  let ppFromDate: string | null = null, ppToDate: string | null = null;
  if (hasPP) {
    const f = new Date(fromDate + 'T00:00:00Z');
    const t = new Date(toDate   + 'T00:00:00Z');
    const dur = t.getTime() - f.getTime();
    const ppTo  = new Date(f.getTime() - 86_400_000);
    const ppFrom = new Date(ppTo.getTime() - dur);
    ppFromDate = ppFrom.toISOString().slice(0, 10);
    ppToDate   = ppTo.toISOString().slice(0, 10);
  }

  // Prior-year: same calendar period, one year back
  let pyFromDate: string | null = null, pyToDate: string | null = null;
  if (hasPY) {
    const f = new Date(fromDate + 'T00:00:00Z');
    const t = new Date(toDate   + 'T00:00:00Z');
    f.setFullYear(f.getFullYear() - 1);
    t.setFullYear(t.getFullYear() - 1);
    pyFromDate = f.toISOString().slice(0, 10);
    pyToDate   = t.toISOString().slice(0, 10);
  }

  const currentFilter = buildPeriodFilter(fromDate, toDate, options.periodId);
  const ytdFilter     = options.periodId ? currentFilter : buildPeriodFilter(ytdFrom, toDate);
  const ppFilter      = ppFromDate && ppToDate ? buildPeriodFilter(ppFromDate, ppToDate) : null;
  const pyFilter      = pyFromDate && pyToDate ? buildPeriodFilter(pyFromDate, pyToDate) : null;

  // ── Parallel aggregations ──
  const [
    [currRevAgg, currExpAgg],
    [ytdRevAgg,  ytdExpAgg],
    [ppRevAgg,   ppExpAgg],
    [pyRevAgg,   pyExpAgg],
  ] = await Promise.all([
    Promise.all([
      aggregateByClass(organisationId, [AccountClass.REVENUE], currentFilter),
      aggregateByClass(organisationId, [AccountClass.EXPENSE], currentFilter),
    ]),
    Promise.all([
      aggregateByClass(organisationId, [AccountClass.REVENUE], ytdFilter),
      aggregateByClass(organisationId, [AccountClass.EXPENSE], ytdFilter),
    ]),
    ppFilter
      ? Promise.all([aggregateByClass(organisationId, [AccountClass.REVENUE], ppFilter), aggregateByClass(organisationId, [AccountClass.EXPENSE], ppFilter)])
      : Promise.resolve([null, null] as [null, null]),
    pyFilter
      ? Promise.all([aggregateByClass(organisationId, [AccountClass.REVENUE], pyFilter), aggregateByClass(organisationId, [AccountClass.EXPENSE], pyFilter)])
      : Promise.resolve([null, null] as [null, null]),
  ]);

  // ── Fetch account metadata (one query) ──
  const allIds = new Set<string>([
    ...currRevAgg.keys(), ...currExpAgg.keys(),
    ...ytdRevAgg.keys(),  ...ytdExpAgg.keys(),
    ...(ppRevAgg?.keys() ?? []), ...(ppExpAgg?.keys() ?? []),
    ...(pyRevAgg?.keys() ?? []), ...(pyExpAgg?.keys() ?? []),
  ]);

  const allAccounts = allIds.size ? await prisma.account.findMany({
    where: { id: { in: [...allIds] }, organisationId, isDeleted: false },
    select: { id: true, code: true, name: true, class: true, type: true, subClass: true },
    orderBy: { code: 'asc' },
  }) : [];

  const revAccounts = allAccounts.filter((a) => a.class === AccountClass.REVENUE);
  const expAccounts = allAccounts.filter((a) => a.class === AccountClass.EXPENSE);

  // ── Revenue: split operating vs finance income ──
  const opRevAccounts = revAccounts.filter((a) => !isFinanceIncomeAccount(a.subClass, a.name));
  const fiRevAccounts = revAccounts.filter((a) =>  isFinanceIncomeAccount(a.subClass, a.name));

  // ── Expense: classify into buckets ──
  const cogsAccounts = expAccounts.filter((a) => a.type === AccountType.COST_OF_SALES);
  const opexAccounts = expAccounts.filter((a) =>
    a.type !== AccountType.COST_OF_SALES &&
    !isFinanceCostAccount(a.subClass, a.name) &&
    !isTaxAccount(a.subClass, a.name) &&
    !isExceptionalAccount(a.subClass, a.name),
  );
  const exceptionalAccounts = expAccounts.filter((a) => isExceptionalAccount(a.subClass, a.name));
  const finCostAccounts     = expAccounts.filter((a) =>
    !isExceptionalAccount(a.subClass, a.name) &&
    a.type !== AccountType.COST_OF_SALES &&
    isFinanceCostAccount(a.subClass, a.name),
  );
  const taxAccounts = expAccounts.filter((a) => isTaxAccount(a.subClass, a.name));

  // ── Map helpers ──
  const revMaps: ISMaps = { current: currRevAgg, ytd: ytdRevAgg, pp: ppRevAgg as AggMap | null, py: pyRevAgg as AggMap | null };
  const expMaps: ISMaps = { current: currExpAgg, ytd: ytdExpAgg, pp: ppExpAgg as AggMap | null, py: pyExpAgg as AggMap | null };

  function sumSection(accs: typeof allAccounts, cls: AccountClass, maps: ISMaps) {
    let cur = new Prisma.Decimal(0), ytd = new Prisma.Decimal(0);
    let pp: Prisma.Decimal | null = maps.pp ? new Prisma.Decimal(0) : null;
    let py: Prisma.Decimal | null = maps.py ? new Prisma.Decimal(0) : null;
    for (const a of accs) {
      const get = (agg: AggMap | null) => {
        if (!agg) return null;
        const s = agg.get(a.id);
        return s ? netBalance(cls, s.debit, s.credit) : new Prisma.Decimal(0);
      };
      cur = cur.add(get(maps.current)!);
      ytd = ytd.add(get(maps.ytd)!);
      if (pp != null) { const v = get(maps.pp); if (v != null) pp = pp.add(v); }
      if (py != null) { const v = get(maps.py); if (v != null) py = py.add(v); }
    }
    return { cur, ytd, pp, py };
  }

  // ── Total operating revenue (for margin calculations) ──
  const revTotals = sumSection(opRevAccounts, AccountClass.REVENUE, revMaps);
  const totalRevCur = revTotals.cur;
  const totalRevYtd = revTotals.ytd;

  // ── Build sections ──
  const revenueSection = buildISSection('Revenue', opRevAccounts, revenueGroupLabel, IS_REVENUE_ORDER, AccountClass.REVENUE, revMaps, showZero, totalRevCur);
  const cogsSection    = buildISSection('Cost of Sales', cogsAccounts, () => 'Cost of Sales', ['Cost of Sales'], AccountClass.EXPENSE, expMaps, showZero, totalRevCur);

  // D&A accounts inside opex (for EBITDA extraction)
  const daAccounts   = opexAccounts.filter((a) => isDA(a.subClass, a.name));
  const nonDAAccounts = opexAccounts.filter((a) => !isDA(a.subClass, a.name));

  const opexSection = buildISSection('Operating Expenses', opexAccounts, expenseGroupLabel, IS_OPEX_ORDER, AccountClass.EXPENSE, expMaps, showZero, totalRevCur);

  // ── Key subtotal lines ──
  const cogsTotals = sumSection(cogsAccounts, AccountClass.EXPENSE, expMaps);
  const opexTotals = sumSection(opexAccounts, AccountClass.EXPENSE, expMaps);
  const daTotals   = sumSection(daAccounts,   AccountClass.EXPENSE, expMaps);
  const nonDATotals = sumSection(nonDAAccounts, AccountClass.EXPENSE, expMaps);

  // Gross Profit
  const gpCur = totalRevCur.sub(cogsTotals.cur);
  const gpYtd = totalRevYtd.sub(cogsTotals.ytd);
  const gpPP  = hasPP && revTotals.pp != null && cogsTotals.pp != null ? revTotals.pp.sub(cogsTotals.pp) : null;
  const gpPY  = hasPY && revTotals.py != null && cogsTotals.py != null ? revTotals.py.sub(cogsTotals.py) : null;

  // EBITDA = GP - OpEx (excl D&A)
  const ebitdaCur = gpCur.sub(nonDATotals.cur);
  const ebitdaYtd = gpYtd.sub(nonDATotals.ytd);
  const ebitdaPP  = hasPP && gpPP != null && nonDATotals.pp != null ? gpPP.sub(nonDATotals.pp) : null;
  const ebitdaPY  = hasPY && gpPY != null && nonDATotals.py != null ? gpPY.sub(nonDATotals.py) : null;

  // Operating Profit (EBIT) = GP - All OpEx
  const ebitCur = gpCur.sub(opexTotals.cur);
  const ebitYtd = gpYtd.sub(opexTotals.ytd);
  const ebitPP  = hasPP && gpPP != null && opexTotals.pp != null ? gpPP.sub(opexTotals.pp) : null;
  const ebitPY  = hasPY && gpPY != null && opexTotals.py != null ? gpPY.sub(opexTotals.py) : null;

  // Finance items
  const fiTotals  = sumSection(fiRevAccounts, AccountClass.REVENUE, revMaps);
  const fcTotals  = sumSection(finCostAccounts, AccountClass.EXPENSE, expMaps);
  const excTotals = sumSection(exceptionalAccounts, AccountClass.EXPENSE, expMaps);

  // Net finance = FinIncome - FinCost
  const netFinCur = fiTotals.cur.sub(fcTotals.cur);
  const netFinYtd = fiTotals.ytd.sub(fcTotals.ytd);
  const netFinPP  = hasPP && fiTotals.pp != null && fcTotals.pp != null ? fiTotals.pp.sub(fcTotals.pp) : null;
  const netFinPY  = hasPY && fiTotals.py != null && fcTotals.py != null ? fiTotals.py.sub(fcTotals.py) : null;

  // PBT = EBIT - Exceptional + NetFinance
  const excSign = (v: Prisma.Decimal | null) => v ? v.neg() : null;
  const pbtCur = ebitCur.sub(excTotals.cur).add(netFinCur);
  const pbtYtd = ebitYtd.sub(excTotals.ytd).add(netFinYtd);
  const pbtPP  = hasPP && ebitPP != null && excTotals.pp != null && netFinPP != null ? ebitPP.sub(excTotals.pp).add(netFinPP) : null;
  const pbtPY  = hasPY && ebitPY != null && excTotals.py != null && netFinPY != null ? ebitPY.sub(excTotals.py).add(netFinPY) : null;

  // Tax & Profit
  const taxTotals = sumSection(taxAccounts, AccountClass.EXPENSE, expMaps);
  const profCur = pbtCur.sub(taxTotals.cur);
  const profYtd = pbtYtd.sub(taxTotals.ytd);
  const profPP  = hasPP && pbtPP != null && taxTotals.pp != null ? pbtPP.sub(taxTotals.pp) : null;
  const profPY  = hasPY && pbtPY != null && taxTotals.py != null ? pbtPY.sub(taxTotals.py) : null;

  // Finance Income section
  const finIncomeSection = fiRevAccounts.length
    ? buildISSection('Finance Income', fiRevAccounts, () => 'Finance Income', ['Finance Income'], AccountClass.REVENUE, revMaps, showZero, totalRevCur)
    : null;
  const finCostsSection = finCostAccounts.length
    ? buildISSection('Finance Costs', finCostAccounts, () => 'Finance Costs', ['Finance Costs'], AccountClass.EXPENSE, expMaps, showZero, totalRevCur)
    : null;
  const exceptionalSection = exceptionalAccounts.length
    ? buildISSection('Exceptional Items', exceptionalAccounts, () => 'Exceptional Items', ['Exceptional Items'], AccountClass.EXPENSE, expMaps, showZero, totalRevCur)
    : null;
  const taxSection = taxAccounts.length
    ? buildISSection('Income Tax Expense', taxAccounts, () => 'Income Tax', ['Income Tax'], AccountClass.EXPENSE, expMaps, showZero, totalRevCur)
    : null;

  const _ = excSign; void _;  // suppress unused warning

  return {
    organisation: { id: org.id, name: org.name, currency: org.baseCurrency },
    period: {
      fromDate, toDate, ytdFromDate: ytdFrom,
      priorPeriodFromDate: ppFromDate, priorPeriodToDate: ppToDate,
      priorYearFromDate: pyFromDate, priorYearToDate: pyToDate,
      comparisons,
    },
    revenue: revenueSection,
    costOfSales: cogsSection,
    grossProfit: makeISSubtotal('Gross Profit', gpCur, gpYtd, gpPP, gpPY, totalRevCur),
    grossMarginPct: { current: marginPct(gpCur, totalRevCur), ytd: marginPct(gpYtd, totalRevYtd) },
    operatingExpenses: opexSection,
    depreciationAmortisation: makeISSubtotal('Depreciation & Amortisation', daTotals.cur, daTotals.ytd, daTotals.pp, daTotals.py, totalRevCur),
    ebitda: makeISSubtotal('EBITDA', ebitdaCur, ebitdaYtd, ebitdaPP, ebitdaPY, totalRevCur),
    ebitdaMarginPct: { current: marginPct(ebitdaCur, totalRevCur), ytd: marginPct(ebitdaYtd, totalRevYtd) },
    operatingProfit: makeISSubtotal('Operating Profit (EBIT)', ebitCur, ebitYtd, ebitPP, ebitPY, totalRevCur),
    operatingMarginPct: { current: marginPct(ebitCur, totalRevCur), ytd: marginPct(ebitYtd, totalRevYtd) },
    exceptionalItems: exceptionalSection,
    financeIncome: finIncomeSection,
    financeCosts: finCostsSection,
    netFinanceItems: makeISSubtotal('Net Finance Items', netFinCur, netFinYtd, netFinPP, netFinPY, totalRevCur),
    profitBeforeTax: makeISSubtotal('Profit Before Tax', pbtCur, pbtYtd, pbtPP, pbtPY, totalRevCur),
    taxExpense: taxSection,
    profitForPeriodLine: makeISSubtotal('Profit for the Period', profCur, profYtd, profPP, profPY, totalRevCur),
    netMarginPct: { current: marginPct(profCur, totalRevCur), ytd: marginPct(profYtd, totalRevYtd) },
    profitForPeriod: profCur.toFixed(2),
  };
}

// ─── Income Statement drill-down ──────────────────────────────────────────────

export async function getIncomeStatementDrilldown(
  organisationId: string,
  accountId: string,
  fromDate: string,
  toDate: string,
) {
  const account = await prisma.account.findFirst({
    where: { id: accountId, organisationId, isDeleted: false },
    select: { id: true, code: true, name: true, class: true, type: true },
  });
  if (!account) throw new NotFoundError('Account not found');

  const entries = await prisma.ledgerEntry.findMany({
    where: {
      accountId,
      organisationId,
      transactionDate: {
        gte: new Date(fromDate + 'T00:00:00Z'),
        lte: new Date(toDate   + 'T23:59:59Z'),
      },
    },
    include: {
      journalEntry: { select: { reference: true, description: true } },
    },
    orderBy: { transactionDate: 'asc' },
    take: 200,
  });

  const isDebitNormal = account.class === AccountClass.ASSET || account.class === AccountClass.EXPENSE;
  let running = new Prisma.Decimal(0);

  const rows = entries.map((e) => {
    const d = e.debitAmount  ?? new Prisma.Decimal(0);
    const c = e.creditAmount ?? new Prisma.Decimal(0);
    const net = isDebitNormal ? d.sub(c) : c.sub(d);
    running = running.add(net);
    return {
      id: e.id,
      date: e.transactionDate.toISOString().slice(0, 10),
      journalId: e.journalEntryId,
      journalRef: e.journalEntry?.reference ?? '',
      journalDescription: e.journalEntry?.description ?? '',
      debit:  d.toFixed(2),
      credit: c.toFixed(2),
      runningBalance: running.toFixed(2),
    };
  });

  return {
    account: { id: account.id, code: account.code, name: account.name, type: account.type },
    fromDate, toDate,
    total: running.toFixed(2),
    entries: rows,
  };
}

// ─── Cash Flow Statement (IAS 7 — Indirect Method) ───────────────────────────

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

// ─── Cash Flow Statement — IAS 7 Indirect Method ─────────────────────────────

export interface CFSMultiPeriod {
  current: string;
  priorPeriod?: string;
  priorYear?: string;
}

export interface CFSLine {
  accountId: string;
  code: string;
  name: string;
  label?: string;
  amounts: CFSMultiPeriod;
}

export interface CFSSection {
  label: string;
  lines: CFSLine[];
  subtotal: CFSMultiPeriod;
}

export interface CashFlowResult {
  organisation: { id: string; name: string; currency: string };
  fromDate: string;
  toDate: string;
  priorPeriod: { fromDate: string; toDate: string } | null;
  priorYear: { fromDate: string; toDate: string } | null;
  netProfit: CFSMultiPeriod;
  nonCashAdjustments: CFSSection;
  workingCapitalChanges: CFSSection;
  netCashFromOperating: CFSMultiPeriod;
  investingActivities: CFSSection;
  netCashFromInvesting: CFSMultiPeriod;
  financingActivities: CFSSection;
  netCashFromFinancing: CFSMultiPeriod;
  netChangeInCash: CFSMultiPeriod;
  openingCash: CFSMultiPeriod;
  closingCashCFS: CFSMultiPeriod;
  closingCashBS: string;
  reconciled: boolean;
  disclosures: {
    interestPaid: CFSMultiPeriod;
    taxPaid: CFSMultiPeriod;
    nonCashTransactions: string[];
  };
}

export interface CashFlowOptions {
  fromDate?: string;
  toDate?: string;
  periodId?: string;
  comparisons?: ('prior_period' | 'prior_year')[];
}

export async function getCashFlowStatement(
  organisationId: string,
  options: CashFlowOptions = {},
): Promise<CashFlowResult> {
  const org = await verifyOrg(organisationId);

  const D = (n: number | string) => new Prisma.Decimal(n);

  const today    = new Date().toISOString().slice(0, 10);
  const toDate   = options.toDate   ?? today;
  const fromDate = options.fromDate ?? `${toDate.slice(0, 4)}-01-01`;
  const comparisons = options.comparisons ?? [];
  const hasPP = comparisons.includes('prior_period');
  const hasPY = comparisons.includes('prior_year');

  // Prior-period dates (same duration, ending day before fromDate)
  let ppFrom: string | null = null, ppTo: string | null = null;
  if (hasPP) {
    const f   = new Date(fromDate + 'T00:00:00Z');
    const t   = new Date(toDate   + 'T00:00:00Z');
    const dur = t.getTime() - f.getTime();
    const ppEnd   = new Date(f.getTime() - 86_400_000);
    const ppStart = new Date(ppEnd.getTime() - dur);
    ppFrom = ppStart.toISOString().slice(0, 10);
    ppTo   = ppEnd.toISOString().slice(0, 10);
  }

  // Prior-year dates (same calendar period, one year back)
  let pyFrom: string | null = null, pyTo: string | null = null;
  if (hasPY) {
    const f = new Date(fromDate + 'T00:00:00Z');
    const t = new Date(toDate   + 'T00:00:00Z');
    f.setFullYear(f.getFullYear() - 1);
    t.setFullYear(t.getFullYear() - 1);
    pyFrom = f.toISOString().slice(0, 10);
    pyTo   = t.toISOString().slice(0, 10);
  }

  const curFilter = buildPeriodFilter(fromDate, toDate, options.periodId);
  const ppFilter  = ppFrom && ppTo ? buildPeriodFilter(ppFrom, ppTo) : null;
  const pyFilter  = pyFrom && pyTo ? buildPeriodFilter(pyFrom, pyTo) : null;

  // All account metadata (one query — exclude control/deleted)
  const allAccounts = await prisma.account.findMany({
    where: { organisationId, isDeleted: false, isControlAccount: false },
    select: { id: true, code: true, name: true, class: true, type: true, subClass: true },
    orderBy: { code: 'asc' },
  });

  const cashIds = allAccounts
    .filter((a) => a.type === AccountType.BANK || a.type === AccountType.CASH)
    .map((a) => a.id);

  // Period movement aggregations + point-in-time cash balances
  const openingDay = new Date(new Date(fromDate + 'T00:00:00Z').getTime() - 86_400_000)
    .toISOString().slice(0, 10);

  const ppOpenDay = ppFrom
    ? new Date(new Date(ppFrom + 'T00:00:00Z').getTime() - 86_400_000).toISOString().slice(0, 10)
    : null;

  const pyOpenDay = pyFrom
    ? new Date(new Date(pyFrom + 'T00:00:00Z').getTime() - 86_400_000).toISOString().slice(0, 10)
    : null;

  const [
    curMov, ppMov, pyMov,
    cashOpening, cashClosingBS,
    cashPPOpening, cashPYOpening,
  ] = await Promise.all([
    aggregateForCFS(organisationId, curFilter),
    ppFilter ? aggregateForCFS(organisationId, ppFilter) : Promise.resolve(null as AggMap | null),
    pyFilter ? aggregateForCFS(organisationId, pyFilter) : Promise.resolve(null as AggMap | null),
    cashIds.length ? aggregateForCFS(organisationId, buildDateFilter(openingDay), cashIds) : Promise.resolve(new Map() as AggMap),
    cashIds.length ? aggregateForCFS(organisationId, buildDateFilter(toDate), cashIds) : Promise.resolve(new Map() as AggMap),
    cashIds.length && ppOpenDay ? aggregateForCFS(organisationId, buildDateFilter(ppOpenDay), cashIds) : Promise.resolve(null as AggMap | null),
    cashIds.length && pyOpenDay ? aggregateForCFS(organisationId, buildDateFilter(pyOpenDay), cashIds) : Promise.resolve(null as AggMap | null),
  ]);

  // ── Local helpers ──────────────────────────────────────────────────────────
  const getDebitMinus = (map: AggMap | null, id: string): Prisma.Decimal | null => {
    if (!map) return null;
    const s = map.get(id);
    return s ? s.debit.sub(s.credit) : D(0);
  };

  const sumCash = (map: AggMap): Prisma.Decimal =>
    cashIds.reduce((s, id) => {
      const e = map.get(id);
      return s.add(e ? e.debit.sub(e.credit) : D(0));
    }, D(0));

  type MPD = { cur: Prisma.Decimal; pp: Prisma.Decimal | null; py: Prisma.Decimal | null };
  const toMP = (m: MPD): CFSMultiPeriod => ({
    current: m.cur.toFixed(2),
    ...(m.pp != null ? { priorPeriod: m.pp.toFixed(2) } : {}),
    ...(m.py != null ? { priorYear:   m.py.toFixed(2) } : {}),
  });

  // ── 1. Net Profit — after tax, after interest ─────────────────────────────
  // profit = sum(credit - debit) for all P&L accounts = -sum(netDebit)
  let npCur = D(0), npPP = hasPP ? D(0) : null, npPY = hasPY ? D(0) : null;
  for (const acc of allAccounts) {
    if (acc.class !== AccountClass.REVENUE && acc.class !== AccountClass.EXPENSE) continue;
    const m = getDebitMinus(curMov, acc.id);
    if (m !== null) npCur = npCur.sub(m);
    if (hasPP && npPP !== null) { const x = getDebitMinus(ppMov, acc.id); if (x !== null) npPP = npPP.sub(x); }
    if (hasPY && npPY !== null) { const x = getDebitMinus(pyMov, acc.id); if (x !== null) npPY = npPY.sub(x); }
  }

  // ── 2. Non-cash adjustments (D&A, impairment) ─────────────────────────────
  // These reduced net profit; add them back (expense netDebit is positive = amount charged)
  const nonCashLines: CFSLine[] = [];
  for (const acc of allAccounts) {
    if (acc.class !== AccountClass.EXPENSE) continue;
    const daFlag   = isDA(acc.subClass, acc.name);
    const imFlag   = (acc.subClass ?? '').toUpperCase().includes('IMPAIR') ||
                     acc.name.toLowerCase().includes('impairment loss');
    if (!daFlag && !imFlag) continue;

    const cAmt  = getDebitMinus(curMov, acc.id) ?? D(0);
    const ppAmt = hasPP ? (getDebitMinus(ppMov, acc.id) ?? D(0)) : null;
    const pyAmt = hasPY ? (getDebitMinus(pyMov, acc.id) ?? D(0)) : null;
    if (cAmt.isZero() && (ppAmt == null || ppAmt.isZero()) && (pyAmt == null || pyAmt.isZero())) continue;

    nonCashLines.push({ accountId: acc.id, code: acc.code, name: acc.name,
      amounts: toMP({ cur: cAmt, pp: ppAmt, py: pyAmt }) });
  }

  const ncCur = nonCashLines.reduce((s, l) => s.add(D(l.amounts.current)),           D(0));
  const ncPP  = hasPP ? nonCashLines.reduce((s, l) => s.add(D(l.amounts.priorPeriod ?? 0)), D(0)) : null;
  const ncPY  = hasPY ? nonCashLines.reduce((s, l) => s.add(D(l.amounts.priorYear   ?? 0)), D(0)) : null;

  const nonCashAdjustments: CFSSection = {
    label: 'Adjustments for Non-Cash Items',
    lines: nonCashLines,
    subtotal: toMP({ cur: ncCur, pp: ncPP, py: ncPY }),
  };

  // ── 3. Working capital changes ─────────────────────────────────────────────
  // CFS effect = -(debit - credit). Works for both asset and liability accounts:
  // Asset increases (debit > credit) → negative CFS (outflow) ✓
  // Liability increases (credit > debit) → positive CFS (inflow) ✓
  const isWC = (acc: typeof allAccounts[0]): boolean => {
    if (acc.class === AccountClass.ASSET) {
      return acc.type === AccountType.RECEIVABLE ||
             acc.type === AccountType.INVENTORY  ||
             acc.type === AccountType.TAX_RECEIVABLE ||
             acc.name.toLowerCase().includes('prepaid') ||
             acc.name.toLowerCase().includes('prepayment') ||
             acc.name.toLowerCase().includes('advance paid');
    }
    if (acc.class === AccountClass.LIABILITY) {
      if (acc.type === AccountType.PAYABLE || acc.type === AccountType.TAX_PAYABLE) return true;
      // Accrued liabilities, other current payables (exclude loans/leases)
      const sc = (acc.subClass ?? '').toUpperCase();
      const nm = acc.name.toLowerCase();
      if (sc.includes('LOAN') || sc.includes('BORROW') || sc.includes('LEASE') || nm.includes('loan') || nm.includes('borrowing') || nm.includes('lease')) return false;
      if (nm.includes('accrued') || nm.includes('accrual') || nm.includes('deferred') || nm.includes('advance received') || nm.includes('other payable')) return true;
    }
    return false;
  };

  const wcLabelFor = (acc: typeof allAccounts[0]): string => {
    if (acc.type === AccountType.RECEIVABLE) return '(Increase)/Decrease in trade receivables';
    if (acc.type === AccountType.INVENTORY)  return '(Increase)/Decrease in inventories';
    if (acc.type === AccountType.TAX_RECEIVABLE) return '(Increase)/Decrease in tax receivables';
    if (acc.type === AccountType.PAYABLE)    return 'Increase/(Decrease) in trade payables';
    if (acc.type === AccountType.TAX_PAYABLE) return 'Increase/(Decrease) in tax payables';
    const nm = acc.name.toLowerCase();
    if (nm.includes('prepaid') || nm.includes('prepayment')) return '(Increase)/Decrease in prepayments';
    if (acc.class === AccountClass.LIABILITY) return `Increase/(Decrease) in ${acc.name}`;
    return `(Increase)/Decrease in ${acc.name}`;
  };

  const wcLines: CFSLine[] = [];
  for (const acc of allAccounts) {
    if (!isWC(acc)) continue;
    const cMov  = getDebitMinus(curMov, acc.id) ?? D(0);
    const ppMov2 = hasPP ? (getDebitMinus(ppMov, acc.id) ?? D(0)) : null;
    const pyMov2 = hasPY ? (getDebitMinus(pyMov, acc.id) ?? D(0)) : null;
    const cEff  = cMov.neg();
    const ppEff = ppMov2 != null ? ppMov2.neg() : null;
    const pyEff = pyMov2 != null ? pyMov2.neg() : null;
    if (cEff.isZero() && (ppEff == null || ppEff.isZero()) && (pyEff == null || pyEff.isZero())) continue;
    wcLines.push({ accountId: acc.id, code: acc.code, name: acc.name, label: wcLabelFor(acc),
      amounts: toMP({ cur: cEff, pp: ppEff, py: pyEff }) });
  }

  const wcCur = wcLines.reduce((s, l) => s.add(D(l.amounts.current)),           D(0));
  const wcPP  = hasPP ? wcLines.reduce((s, l) => s.add(D(l.amounts.priorPeriod ?? 0)), D(0)) : null;
  const wcPY  = hasPY ? wcLines.reduce((s, l) => s.add(D(l.amounts.priorYear   ?? 0)), D(0)) : null;

  const workingCapitalChanges: CFSSection = {
    label: 'Changes in Working Capital',
    lines: wcLines,
    subtotal: toMP({ cur: wcCur, pp: wcPP, py: wcPY }),
  };

  const opCur = npCur.add(ncCur).add(wcCur);
  const opPP  = hasPP && npPP !== null && ncPP !== null && wcPP !== null ? npPP.add(ncPP).add(wcPP) : null;
  const opPY  = hasPY && npPY !== null && ncPY !== null && wcPY !== null ? npPY.add(ncPY).add(wcPY) : null;
  const netCashFromOperating = toMP({ cur: opCur, pp: opPP, py: opPY });

  // ── 4. Investing Activities ────────────────────────────────────────────────
  // Fixed-asset cost accounts, intangibles, ROU assets (exclude accum. depr.)
  // Debit-normal assets: -(netDebit) → capex is negative (outflow), disposals positive
  const isCapex = (acc: typeof allAccounts[0]): boolean => {
    if (acc.class !== AccountClass.ASSET) return false;
    if (acc.type !== AccountType.FIXED_ASSET && acc.type !== AccountType.INTANGIBLE && acc.type !== AccountType.RIGHT_OF_USE_ASSET) return false;
    const sc = (acc.subClass ?? '').toUpperCase();
    const nm = acc.name.toLowerCase();
    // Exclude contra-asset accounts (accumulated depreciation/amortisation/provision)
    if (sc.includes('ACCUM') || sc.includes('PROVISION') || sc.includes('DEPRECIATION') || sc.includes('AMORTIS') || sc.includes('AMORTIZ')) return false;
    if (nm.includes('accum') || nm.includes('provision for') || nm.includes('depreciation') || nm.includes('amortis') || nm.includes('amortiz')) return false;
    return true;
  };

  const investLines: CFSLine[] = [];
  for (const acc of allAccounts) {
    if (!isCapex(acc)) continue;
    const cMov  = getDebitMinus(curMov, acc.id) ?? D(0);
    const ppMov3 = hasPP ? (getDebitMinus(ppMov, acc.id) ?? D(0)) : null;
    const pyMov3 = hasPY ? (getDebitMinus(pyMov, acc.id) ?? D(0)) : null;
    const cEff  = cMov.neg();
    const ppEff = ppMov3 != null ? ppMov3.neg() : null;
    const pyEff = pyMov3 != null ? pyMov3.neg() : null;
    if (cEff.isZero() && (ppEff == null || ppEff.isZero()) && (pyEff == null || pyEff.isZero())) continue;

    const capexLabel = acc.type === AccountType.INTANGIBLE
      ? `Acquisition of intangibles — ${acc.name}`
      : acc.type === AccountType.RIGHT_OF_USE_ASSET
        ? `Right-of-use asset recognised — ${acc.name}`
        : `Capital expenditure — ${acc.name}`;

    investLines.push({ accountId: acc.id, code: acc.code, name: acc.name, label: capexLabel,
      amounts: toMP({ cur: cEff, pp: ppEff, py: pyEff }) });
  }

  const invCur = investLines.reduce((s, l) => s.add(D(l.amounts.current)),           D(0));
  const invPP  = hasPP ? investLines.reduce((s, l) => s.add(D(l.amounts.priorPeriod ?? 0)), D(0)) : null;
  const invPY  = hasPY ? investLines.reduce((s, l) => s.add(D(l.amounts.priorYear   ?? 0)), D(0)) : null;

  const investingActivities: CFSSection = {
    label: 'Investing Activities',
    lines: investLines,
    subtotal: toMP({ cur: invCur, pp: invPP, py: invPY }),
  };
  const netCashFromInvesting = toMP({ cur: invCur, pp: invPP, py: invPY });

  // ── 5. Financing Activities ────────────────────────────────────────────────
  // Loans, lease liabilities, share capital, dividends
  // Liability/equity are credit-normal → CFS = -(netDebit) = credit - debit
  const isFinancing = (acc: typeof allAccounts[0]): boolean => {
    if (acc.class === AccountClass.LIABILITY) {
      const sc = (acc.subClass ?? '').toUpperCase();
      const nm = acc.name.toLowerCase();
      return sc.includes('LOAN') || sc.includes('BORROW') || sc.includes('LEASE') || sc.includes('OVERDRAFT') ||
             nm.includes('loan') || nm.includes('borrowing') || nm.includes('lease liability') ||
             nm.includes('overdraft') || nm.includes('credit facility');
    }
    if (acc.class === AccountClass.EQUITY) {
      const sc = (acc.subClass ?? '').toUpperCase();
      const nm = acc.name.toLowerCase();
      // Retained earnings flow through net profit in the operating section — exclude here
      if (sc.includes('RETAINED') || nm.includes('retained earnings') ||
          nm.includes('accumulated profit') || nm.includes('accumulated loss')) return false;
      // All other equity movements are financing activities per IAS 7.17
      // (share issuances, owner contributions, dividends, capital repayments)
      return true;
    }
    return false;
  };

  const finLines: CFSLine[] = [];
  for (const acc of allAccounts) {
    if (!isFinancing(acc)) continue;
    const cMov  = getDebitMinus(curMov, acc.id) ?? D(0);
    const ppMov4 = hasPP ? (getDebitMinus(ppMov, acc.id) ?? D(0)) : null;
    const pyMov4 = hasPY ? (getDebitMinus(pyMov, acc.id) ?? D(0)) : null;
    const cEff  = cMov.neg(); // credit - debit: inflow positive, outflow negative
    const ppEff = ppMov4 != null ? ppMov4.neg() : null;
    const pyEff = pyMov4 != null ? pyMov4.neg() : null;
    if (cEff.isZero() && (ppEff == null || ppEff.isZero()) && (pyEff == null || pyEff.isZero())) continue;
    finLines.push({ accountId: acc.id, code: acc.code, name: acc.name,
      amounts: toMP({ cur: cEff, pp: ppEff, py: pyEff }) });
  }

  const finCur = finLines.reduce((s, l) => s.add(D(l.amounts.current)),           D(0));
  const finPP  = hasPP ? finLines.reduce((s, l) => s.add(D(l.amounts.priorPeriod ?? 0)), D(0)) : null;
  const finPY  = hasPY ? finLines.reduce((s, l) => s.add(D(l.amounts.priorYear   ?? 0)), D(0)) : null;

  const financingActivities: CFSSection = {
    label: 'Financing Activities',
    lines: finLines,
    subtotal: toMP({ cur: finCur, pp: finPP, py: finPY }),
  };
  const netCashFromFinancing = toMP({ cur: finCur, pp: finPP, py: finPY });

  // ── 6. Cash reconciliation ─────────────────────────────────────────────────
  const openingBal    = sumCash(cashOpening);
  const closingBSBal  = sumCash(cashClosingBS);
  const ppOpenBal     = cashPPOpening ? sumCash(cashPPOpening) : null;
  const pyOpenBal     = cashPYOpening ? sumCash(cashPYOpening) : null;

  const netChangeCur = opCur.add(invCur).add(finCur);
  const netChangePP  = opPP !== null && invPP !== null && finPP !== null ? opPP.add(invPP).add(finPP) : null;
  const netChangePY  = opPY !== null && invPY !== null && finPY !== null ? opPY.add(invPY).add(finPY) : null;

  const closingCFSBal = openingBal.add(netChangeCur);
  const reconciled    = closingCFSBal.sub(closingBSBal).abs().lessThan(new Prisma.Decimal('0.02'));

  // ── 7. Disclosure notes (IAS 7.31–32: interest paid, tax paid) ────────────
  let intCur = D(0), intPP2 = hasPP ? D(0) : null, intPY2 = hasPY ? D(0) : null;
  let taxCur = D(0), taxPP2 = hasPP ? D(0) : null, taxPY2 = hasPY ? D(0) : null;
  for (const acc of allAccounts) {
    if (acc.class !== AccountClass.EXPENSE) continue;
    if (isFinanceCostAccount(acc.subClass, acc.name)) {
      const m = getDebitMinus(curMov, acc.id) ?? D(0);
      intCur = intCur.add(m);
      if (intPP2 !== null) intPP2 = intPP2.add(getDebitMinus(ppMov, acc.id) ?? D(0));
      if (intPY2 !== null) intPY2 = intPY2.add(getDebitMinus(pyMov, acc.id) ?? D(0));
    }
    if (isTaxAccount(acc.subClass, acc.name)) {
      const m = getDebitMinus(curMov, acc.id) ?? D(0);
      taxCur = taxCur.add(m);
      if (taxPP2 !== null) taxPP2 = taxPP2.add(getDebitMinus(ppMov, acc.id) ?? D(0));
      if (taxPY2 !== null) taxPY2 = taxPY2.add(getDebitMinus(pyMov, acc.id) ?? D(0));
    }
  }

  const nonCashNotes: string[] = [];
  if (investLines.some((l) => l.name.toLowerCase().includes('right-of-use'))) {
    nonCashNotes.push('Right-of-use assets recognised under IFRS 16 are non-cash transactions and included for completeness.');
  }

  return {
    organisation: { id: org.id, name: org.name, currency: org.baseCurrency },
    fromDate,
    toDate,
    priorPeriod: ppFrom && ppTo ? { fromDate: ppFrom, toDate: ppTo } : null,
    priorYear:   pyFrom && pyTo ? { fromDate: pyFrom, toDate: pyTo } : null,

    netProfit: toMP({ cur: npCur, pp: npPP, py: npPY }),
    nonCashAdjustments,
    workingCapitalChanges,
    netCashFromOperating,

    investingActivities,
    netCashFromInvesting,

    financingActivities,
    netCashFromFinancing,

    netChangeInCash: toMP({ cur: netChangeCur, pp: netChangePP, py: netChangePY }),
    openingCash: toMP({ cur: openingBal, pp: ppOpenBal, py: pyOpenBal }),
    closingCashCFS: toMP({
      cur: closingCFSBal,
      pp:  ppOpenBal !== null && netChangePP !== null ? ppOpenBal.add(netChangePP) : null,
      py:  pyOpenBal !== null && netChangePY !== null ? pyOpenBal.add(netChangePY) : null,
    }),
    closingCashBS: closingBSBal.toFixed(2),
    reconciled,

    disclosures: {
      interestPaid: toMP({ cur: intCur, pp: intPP2, py: intPY2 }),
      taxPaid:      toMP({ cur: taxCur, pp: taxPP2, py: taxPY2 }),
      nonCashTransactions: nonCashNotes,
    },
  };
}
