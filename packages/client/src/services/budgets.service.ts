import { api } from './api';

export type BudgetType = 'ORIGINAL' | 'REVISED' | 'ROLLING_FORECAST';
export type CostCentreLevel = 'COMPANY' | 'DIVISION' | 'DEPARTMENT' | 'TEAM';
export type CommitmentType = 'PURCHASE_ORDER' | 'REQUISITION' | 'CONTRACT';
export type CommitmentStatus = 'OPEN' | 'PARTIALLY_INVOICED' | 'FULLY_INVOICED' | 'CANCELLED';

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface Budget {
  id: string;
  name: string;
  fiscalYear: number;
  budgetType: BudgetType;
  version: number;
  parentBudgetId: string | null;
  parentBudget: { id: string; name: string; version: number } | null;
  alertThresholdPct: string | null;
  isApproved: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lineCount: number;
}

export interface BudgetDetail extends Budget {
  revisions: { id: string; name: string; version: number; budgetType: BudgetType; isApproved: boolean }[];
  lines: BudgetLine[];
}

export interface BudgetLine {
  id: string;
  accountId: string;
  costCentreId: string | null;
  periodNumber: number;
  amount: string;
  account?: { id: string; code: string; name: string; class: string };
  costCentre?: { id: string; code: string; name: string } | null;
}

export interface BudgetLineInput {
  accountId: string;
  costCentreId?: string | null;
  periodNumber: number;
  amount: number | string;
}

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

export interface CostCentre {
  id: string;
  code: string;
  name: string;
  description: string | null;
  level: CostCentreLevel;
  parentId: string | null;
  parent: { id: string; code: string; name: string; level: CostCentreLevel } | null;
  isReportableSegment: boolean;
  isActive: boolean;
  _count: { children: number };
}

export interface Department {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
}

export interface BudgetCommitment {
  id: string;
  budgetId: string;
  accountId: string;
  costCentreId: string | null;
  periodNumber: number;
  amount: string;
  invoicedAmount: string;
  referenceType: CommitmentType;
  reference: string | null;
  description: string | null;
  status: CommitmentStatus;
  raisedDate: string;
  raisedBy: string | null;
  closedAt: string | null;
  createdAt: string;
  account?: { id: string; code: string; name: string };
  costCentre?: { id: string; code: string; name: string } | null;
}

export interface SegmentLine {
  costCentreId: string;
  costCentreCode: string;
  costCentreName: string;
  revenue: string;
  expenses: string;
  segmentResult: string;
}

// ── Budgets ───────────────────────────────────────────────────────────────────

export const listBudgets = (organisationId: string) =>
  api.get(`/organisations/${organisationId}/budgets`).then((r) => r.data.data as Budget[]);

export const getBudget = (organisationId: string, budgetId: string) =>
  api.get(`/organisations/${organisationId}/budgets/${budgetId}`).then((r) => r.data.data as BudgetDetail);

export const createBudget = (
  organisationId: string,
  data: { name: string; fiscalYear: number; budgetType?: BudgetType; parentBudgetId?: string },
) =>
  api.post(`/organisations/${organisationId}/budgets`, data).then((r) => r.data.data as Budget);

export const updateBudget = (
  organisationId: string,
  budgetId: string,
  data: { alertThresholdPct?: number | null },
) =>
  api.patch(`/organisations/${organisationId}/budgets/${budgetId}`, data).then((r) => r.data.data as Budget);

export const copyBudget = (
  organisationId: string,
  budgetId: string,
  data: { targetFiscalYear: number; targetName: string; upliftPct: number },
) =>
  api.post(`/organisations/${organisationId}/budgets/${budgetId}/copy`, data).then((r) => r.data.data as BudgetDetail);

export const updateBudgetLines = (
  organisationId: string,
  budgetId: string,
  lines: BudgetLineInput[],
) =>
  api.put(`/organisations/${organisationId}/budgets/${budgetId}/lines`, { lines }).then((r) => r.data.data as BudgetDetail);

export const importBudgetLines = (
  organisationId: string,
  budgetId: string,
  rows: Array<{ accountCode: string; costCentreCode?: string; amounts: Record<number, number> }>,
) =>
  api.post(`/organisations/${organisationId}/budgets/${budgetId}/import`, { rows }).then((r) => r.data.data as BudgetDetail);

export const approveBudget = (organisationId: string, budgetId: string) =>
  api.post(`/organisations/${organisationId}/budgets/${budgetId}/approve`).then((r) => r.data.data as Budget);

export const deleteBudget = (organisationId: string, budgetId: string) =>
  api.delete(`/organisations/${organisationId}/budgets/${budgetId}`);

export const getBudgetVariance = (
  organisationId: string,
  budgetId: string,
  params?: { costCentreId?: string; rollup?: boolean },
) =>
  api
    .get(`/organisations/${organisationId}/budgets/${budgetId}/variance`, {
      params: { ...params, rollup: params?.rollup ? 'true' : undefined },
    })
    .then((r) => r.data.data as BudgetVsActualLine[]);

// ── Commitments ───────────────────────────────────────────────────────────────

export const listCommitments = (organisationId: string, budgetId: string) =>
  api.get(`/organisations/${organisationId}/budgets/${budgetId}/commitments`).then((r) => r.data.data as BudgetCommitment[]);

export const createCommitment = (
  organisationId: string,
  budgetId: string,
  data: {
    accountId: string; costCentreId?: string; periodNumber: number; amount: number;
    referenceType: CommitmentType; reference?: string; description?: string; raisedDate: string;
  },
) =>
  api.post(`/organisations/${organisationId}/budgets/${budgetId}/commitments`, data).then((r) => r.data.data as BudgetCommitment);

export const updateCommitment = (
  organisationId: string,
  budgetId: string,
  commitmentId: string,
  data: { invoicedAmount?: number; status?: CommitmentStatus; description?: string },
) =>
  api.patch(`/organisations/${organisationId}/budgets/${budgetId}/commitments/${commitmentId}`, data).then((r) => r.data.data as BudgetCommitment);

// ── Cost Centres ──────────────────────────────────────────────────────────────

export const listCostCentres = (organisationId: string) =>
  api.get(`/organisations/${organisationId}/budgets/cost-centres`).then((r) => r.data.data as CostCentre[]);

export const createCostCentre = (
  organisationId: string,
  data: { code: string; name: string; description?: string; level?: CostCentreLevel; parentId?: string },
) =>
  api.post(`/organisations/${organisationId}/budgets/cost-centres`, data).then((r) => r.data.data as CostCentre);

export const updateCostCentre = (
  organisationId: string,
  id: string,
  data: {
    name?: string; description?: string; level?: CostCentreLevel;
    parentId?: string | null; isReportableSegment?: boolean; isActive?: boolean;
  },
) =>
  api.patch(`/organisations/${organisationId}/budgets/cost-centres/${id}`, data).then((r) => r.data.data as CostCentre);

// ── Departments ───────────────────────────────────────────────────────────────

export const listDepartments = (organisationId: string) =>
  api.get(`/organisations/${organisationId}/budgets/departments`).then((r) => r.data.data as Department[]);

export const createDepartment = (organisationId: string, data: { code: string; name: string; description?: string }) =>
  api.post(`/organisations/${organisationId}/budgets/departments`, data).then((r) => r.data.data as Department);

// ── IFRS 8 Segment Report ─────────────────────────────────────────────────────

export const getSegmentReport = (organisationId: string, fiscalYear?: number) =>
  api
    .get(`/organisations/${organisationId}/budgets/segment-report`, {
      params: fiscalYear ? { fiscalYear } : undefined,
    })
    .then((r) => r.data.data as SegmentLine[]);
