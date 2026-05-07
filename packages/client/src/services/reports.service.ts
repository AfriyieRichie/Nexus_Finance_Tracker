import { api } from './api';

// ─── Balance Sheet types ───────────────────────────────────────────────────────

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
    retainedEarnings: {
      label: string;
      current: string;
      prior: string | null;
      change: string | null;
      changePct: string | null;
    };
    total: string;
    priorTotal: string | null;
  };
  totalLiabilitiesAndEquity: string;
  priorTotalLiabilitiesAndEquity: string | null;
  isBalanced: boolean;
}

export interface DrilldownEntry {
  id: string;
  date: string;
  journalId: string;
  journalRef: string;
  journalDescription: string;
  debit: string;
  credit: string;
  runningBalance: string;
}

export interface DrilldownResult {
  account: { id: string; code: string; name: string; type: string };
  asOfDate: string;
  openingBalance: string;
  closingBalance: string;
  entries: DrilldownEntry[];
}

// ─── Income Statement types (IAS 1 enhanced) ──────────────────────────────────

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
  profitForPeriod: string;
}

export interface ISDrilldownEntry {
  id: string;
  date: string;
  journalId: string;
  journalRef: string;
  journalDescription: string;
  debit: string;
  credit: string;
  runningBalance: string;
}

export interface ISDrilldownResult {
  account: { id: string; code: string; name: string; type: string };
  fromDate: string;
  toDate: string;
  total: string;
  entries: ISDrilldownEntry[];
}

// ─── Legacy types (kept for other pages) ──────────────────────────────────────

export interface StatementLine {
  accountId: string;
  code: string;
  name: string;
  class: string;
  type: string;
  balance: string;
}

export interface StatementSection {
  label: string;
  lines: StatementLine[];
  subtotal: string;
}

export interface BalanceSheetData {
  organisation: { id: string; name: string; currency: string };
  asOfDate: string | null;
  assets: {
    current: StatementSection;
    nonCurrent: StatementSection;
    total: string;
  };
  liabilities: {
    current: StatementSection;
    nonCurrent: StatementSection;
    total: string;
  };
  equity: {
    items: StatementSection;
    currentPeriodProfit: string;
    total: string;
  };
  totalLiabilitiesAndEquity: string;
  isBalanced: boolean;
}

export interface IncomeStatementData {
  organisation: { id: string; name: string; currency: string };
  period: { fromDate: string | null; toDate: string | null; periodId: string | null };
  revenue: StatementSection;
  costOfSales: StatementSection;
  grossProfit: string;
  operatingExpenses: StatementSection;
  profitForPeriod: string;
}

// ─── API functions ─────────────────────────────────────────────────────────────

export async function getBalanceSheet(
  organisationId: string,
  params?: {
    asOfDate?: string;
    periodId?: string;
    compareTo?: 'prior_period' | 'prior_year';
    showZero?: boolean;
  },
) {
  const res = await api.get(`/organisations/${organisationId}/reports/balance-sheet`, { params });
  return res.data.data as BalanceSheetResult;
}

export async function getBalanceSheetDrilldown(
  organisationId: string,
  accountId: string,
  asOfDate?: string,
) {
  const res = await api.get(`/organisations/${organisationId}/reports/balance-sheet/drilldown`, {
    params: { accountId, asOfDate },
  });
  return res.data.data as DrilldownResult;
}

export async function getIncomeStatement(
  organisationId: string,
  params?: {
    fromDate?: string;
    toDate?: string;
    periodId?: string;
    comparisons?: string;
    showZero?: boolean;
  },
) {
  const res = await api.get(`/organisations/${organisationId}/reports/income-statement`, { params });
  return res.data.data as IncomeStatementResult;
}

export async function getIncomeStatementDrilldown(
  organisationId: string,
  accountId: string,
  fromDate?: string,
  toDate?: string,
) {
  const res = await api.get(`/organisations/${organisationId}/reports/income-statement/drilldown`, {
    params: { accountId, fromDate, toDate },
  });
  return res.data.data as ISDrilldownResult;
}

// ─── Cash Flow Statement types (IAS 7) ────────────────────────────────────────

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

export async function getCashFlow(
  organisationId: string,
  params?: { fromDate?: string; toDate?: string; periodId?: string; comparisons?: string },
) {
  const res = await api.get(`/organisations/${organisationId}/reports/cash-flow`, { params });
  return res.data.data as CashFlowResult;
}

export async function getChangesInEquity(
  organisationId: string,
  params?: { fromDate?: string; toDate?: string; periodId?: string },
) {
  const res = await api.get(`/organisations/${organisationId}/reports/changes-in-equity`, { params });
  return res.data.data;
}
