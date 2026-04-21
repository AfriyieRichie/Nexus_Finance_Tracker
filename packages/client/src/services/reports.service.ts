import { api } from './api';

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

export async function getBalanceSheet(
  organisationId: string,
  params?: { asOfDate?: string; periodId?: string },
) {
  const res = await api.get(`/organisations/${organisationId}/reports/balance-sheet`, { params });
  return res.data.data as BalanceSheetData;
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
