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
  params?: { fromDate?: string; toDate?: string; periodId?: string },
) {
  const res = await api.get(`/organisations/${organisationId}/reports/income-statement`, { params });
  return res.data.data as IncomeStatementData;
}

export async function getCashFlow(
  organisationId: string,
  params?: { fromDate?: string; toDate?: string; periodId?: string },
) {
  const res = await api.get(`/organisations/${organisationId}/reports/cash-flow`, { params });
  return res.data.data;
}

export async function getChangesInEquity(
  organisationId: string,
  params?: { fromDate?: string; toDate?: string; periodId?: string },
) {
  const res = await api.get(`/organisations/${organisationId}/reports/changes-in-equity`, { params });
  return res.data.data;
}
