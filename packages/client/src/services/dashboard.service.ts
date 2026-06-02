import { api } from './api';

export interface DashboardKPIs {
  totalAssets: string;
  totalLiabilities: string;
  netEquity: string;
  cashBalance: string;
  netIncomeMonth: string;
  netIncomeYTD: string;
  arOutstanding: string;
  apOutstanding: string;
}

export interface MonthlyTrendPoint {
  month: string;
  monthNumber: number;
  revenue: string;
  expenses: string;
  profit: string;
}

export interface BudgetAlert {
  budgetId: string;
  budgetName: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  budgeted: string;
  actual: string;
  variancePct: string;
  pctUsed: string;
}

export interface RecentJournal {
  id: string;
  journalNumber: string;
  description: string | null;
  entryDate: string;
  status: string;
  lineCount: number;
}

export interface DashboardData {
  asOfDate: string;
  fiscalYear: number;
  currency: string;
  kpis: DashboardKPIs;
  monthlyTrend: MonthlyTrendPoint[];
  budgetAlerts: BudgetAlert[];
  pendingApprovalsCount: number;
  recentJournals: RecentJournal[];
}

export async function getDashboardData(organisationId: string): Promise<DashboardData> {
  const res = await api.get(`/organisations/${organisationId}/dashboard`);
  return res.data.data as DashboardData;
}
