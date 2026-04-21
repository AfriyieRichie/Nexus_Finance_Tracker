import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendCreated, sendNoContent } from '../../utils/response';
import * as budgetsService from './budgets.service';

// ─── Budgets ──────────────────────────────────────────────────────────────────

export const listBudgets = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const budgets = await budgetsService.listBudgets(organisationId);
  return sendSuccess(res, budgets);
});

export const getBudget = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, budgetId } = req.params;
  const budget = await budgetsService.getBudget(organisationId, budgetId);
  return sendSuccess(res, budget);
});

export const createBudget = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const userId = req.user!.sub;
  const { name, fiscalYear, lines } = req.body as {
    name: string;
    fiscalYear: number;
    lines?: budgetsService.BudgetLineInput[];
  };
  const budget = await budgetsService.createBudget(organisationId, userId, {
    name,
    fiscalYear,
    lines,
  });
  return sendCreated(res, budget, 'Budget created');
});

export const updateBudgetLines = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, budgetId } = req.params;
  const lines = req.body.lines as budgetsService.BudgetLineInput[];
  const budget = await budgetsService.updateBudgetLines(organisationId, budgetId, lines);
  return sendSuccess(res, budget, 'Budget lines updated');
});

export const approveBudget = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, budgetId } = req.params;
  const userId = req.user!.sub;
  const budget = await budgetsService.approveBudget(organisationId, budgetId, userId);
  return sendSuccess(res, budget, 'Budget approved');
});

export const deleteBudget = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, budgetId } = req.params;
  await budgetsService.deleteBudget(organisationId, budgetId);
  return sendNoContent(res);
});

export const getBudgetVsActual = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, budgetId } = req.params;
  const variance = await budgetsService.getBudgetVsActual(organisationId, budgetId);
  return sendSuccess(res, variance);
});

// ─── Cost Centres ─────────────────────────────────────────────────────────────

export const listCostCentres = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const costCentres = await budgetsService.listCostCentres(organisationId);
  return sendSuccess(res, costCentres);
});

export const createCostCentre = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const { code, name, description } = req.body as budgetsService.CreateCostCentreInput;
  const costCentre = await budgetsService.createCostCentre(organisationId, {
    code,
    name,
    description,
  });
  return sendCreated(res, costCentre, 'Cost centre created');
});

export const updateCostCentre = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, id } = req.params;
  const input = req.body as budgetsService.UpdateCostCentreInput;
  const costCentre = await budgetsService.updateCostCentre(organisationId, id, input);
  return sendSuccess(res, costCentre, 'Cost centre updated');
});

// ─── Departments ──────────────────────────────────────────────────────────────

export const listDepartments = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const departments = await budgetsService.listDepartments(organisationId);
  return sendSuccess(res, departments);
});

export const createDepartment = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const { code, name, description } = req.body as budgetsService.CreateDepartmentInput;
  const department = await budgetsService.createDepartment(organisationId, {
    code,
    name,
    description,
  });
  return sendCreated(res, department, 'Department created');
});

export const updateDepartment = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, id } = req.params;
  const input = req.body as budgetsService.UpdateDepartmentInput;
  const department = await budgetsService.updateDepartment(organisationId, id, input);
  return sendSuccess(res, department, 'Department updated');
});
