import { api } from './api';

export type BudgetType = 'ORIGINAL' | 'REVISED' | 'ROLLING_FORECAST';
export type CostCentreLevel = 'COMPANY' | 'DIVISION' | 'DEPARTMENT' | 'TEAM';

export interface Budget {
  id: string;
  name: string;
  fiscalYear: number;
  budgetType: BudgetType;
  version: number;
  parentBudgetId: string | null;
  parentBudget: { id: string; name: string; version: number } | null;
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
  actual: string;
  variance: string;
  variancePct: string | null;
}

export interface CostCentre {
  id: string;
  code: string;
  name: string;
  description: string | null;
  level: CostCentreLevel;
  parentId: string | null;
  parent: { id: string; code: string; name: string; level: CostCentreLevel } | null;
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

export const updateBudgetLines = (
  organisationId: string,
  budgetId: string,
  lines: BudgetLineInput[],
) =>
  api
    .put(`/organisations/${organisationId}/budgets/${budgetId}/lines`, { lines })
    .then((r) => r.data.data as BudgetDetail);

export const approveBudget = (organisationId: string, budgetId: string) =>
  api.post(`/organisations/${organisationId}/budgets/${budgetId}/approve`).then((r) => r.data.data as Budget);

export const deleteBudget = (organisationId: string, budgetId: string) =>
  api.delete(`/organisations/${organisationId}/budgets/${budgetId}`);

export const getBudgetVariance = (organisationId: string, budgetId: string, costCentreId?: string) =>
  api
    .get(`/organisations/${organisationId}/budgets/${budgetId}/variance`, {
      params: costCentreId ? { costCentreId } : undefined,
    })
    .then((r) => r.data.data as BudgetVsActualLine[]);

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
  data: { name?: string; description?: string; level?: CostCentreLevel; parentId?: string | null; isActive?: boolean },
) =>
  api.patch(`/organisations/${organisationId}/budgets/cost-centres/${id}`, data).then((r) => r.data.data as CostCentre);

// ── Departments ───────────────────────────────────────────────────────────────

export const listDepartments = (organisationId: string) =>
  api.get(`/organisations/${organisationId}/budgets/departments`).then((r) => r.data.data as Department[]);

export const createDepartment = (organisationId: string, data: { code: string; name: string; description?: string }) =>
  api.post(`/organisations/${organisationId}/budgets/departments`, data).then((r) => r.data.data as Department);
