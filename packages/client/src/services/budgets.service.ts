import { api } from './api';

export interface Budget {
  id: string;
  name: string;
  fiscalYear: number;
  isApproved: boolean;
  approvedAt: string | null;
  _count?: { lines: number };
}

export interface BudgetLine {
  id: string;
  accountId: string;
  periodNumber: number;
  amount: string;
  account?: { code: string; name: string; class: string };
}

export interface BudgetVarianceLine {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountClass: string;
  budgeted: number;
  actual: number;
  variance: number;
  variancePct: number;
}

export interface CostCentre {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
}

export interface Department {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
}

export async function listBudgets(organisationId: string) {
  const res = await api.get(`/organisations/${organisationId}/budgets/budgets`);
  return res.data.data as Budget[];
}

export async function getBudget(organisationId: string, budgetId: string) {
  const res = await api.get(`/organisations/${organisationId}/budgets/budgets/${budgetId}`);
  return res.data.data as Budget & { lines: BudgetLine[] };
}

export async function createBudget(organisationId: string, data: { name: string; fiscalYear: number }) {
  const res = await api.post(`/organisations/${organisationId}/budgets/budgets`, data);
  return res.data.data as Budget;
}

export async function approveBudget(organisationId: string, budgetId: string) {
  const res = await api.post(`/organisations/${organisationId}/budgets/budgets/${budgetId}/approve`);
  return res.data.data as Budget;
}

export async function getBudgetVariance(organisationId: string, budgetId: string) {
  const res = await api.get(`/organisations/${organisationId}/budgets/budgets/${budgetId}/variance`);
  return res.data.data as BudgetVarianceLine[];
}

export async function listCostCentres(organisationId: string) {
  const res = await api.get(`/organisations/${organisationId}/budgets/cost-centres`);
  return res.data.data as CostCentre[];
}

export async function createCostCentre(organisationId: string, data: { code: string; name: string; description?: string }) {
  const res = await api.post(`/organisations/${organisationId}/budgets/cost-centres`, data);
  return res.data.data as CostCentre;
}

export async function listDepartments(organisationId: string) {
  const res = await api.get(`/organisations/${organisationId}/budgets/departments`);
  return res.data.data as Department[];
}

export async function createDepartment(organisationId: string, data: { code: string; name: string; description?: string }) {
  const res = await api.post(`/organisations/${organisationId}/budgets/departments`, data);
  return res.data.data as Department;
}
