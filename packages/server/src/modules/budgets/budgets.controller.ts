import { Request, Response } from 'express';
import { BudgetType, CommitmentType, CostCentreLevel } from '@prisma/client';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendCreated, sendNoContent } from '../../utils/response';
import * as svc from './budgets.service';

// ─── Budgets ──────────────────────────────────────────────────────────────────

export const listBudgets = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await svc.listBudgets(req.params.organisationId));
});

export const getBudget = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, budgetId } = req.params;
  return sendSuccess(res, await svc.getBudget(organisationId, budgetId));
});

export const createBudget = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const userId = req.user!.sub;
  const { name, fiscalYear, budgetType, parentBudgetId, lines } = req.body as {
    name: string; fiscalYear: number; budgetType?: BudgetType;
    parentBudgetId?: string; lines?: svc.BudgetLineInput[];
  };
  const budget = await svc.createBudget(organisationId, userId, { name, fiscalYear, budgetType, parentBudgetId, lines });
  return sendCreated(res, budget, 'Budget created');
});

export const updateBudget = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, budgetId } = req.params;
  const { alertThresholdPct } = req.body as { alertThresholdPct?: number | null };
  const budget = await svc.updateBudget(organisationId, budgetId, { alertThresholdPct });
  return sendSuccess(res, budget, 'Budget updated');
});

export const copyBudget = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, budgetId } = req.params;
  const userId = req.user!.sub;
  const { targetFiscalYear, targetName, upliftPct } = req.body as {
    targetFiscalYear: number; targetName: string; upliftPct: number;
  };
  const budget = await svc.copyBudget(organisationId, userId, {
    sourceBudgetId: budgetId, targetFiscalYear, targetName, upliftPct: upliftPct ?? 0,
  });
  return sendCreated(res, budget, 'Budget copied');
});

export const updateBudgetLines = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, budgetId } = req.params;
  const lines = req.body.lines as svc.BudgetLineInput[];
  return sendSuccess(res, await svc.updateBudgetLines(organisationId, budgetId, lines), 'Budget lines updated');
});

export const importBudgetLines = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, budgetId } = req.params;
  const { rows } = req.body as { rows: svc.ImportLineInput[] };
  const budget = await svc.importBudgetLines(organisationId, budgetId, rows);
  return sendSuccess(res, budget, 'Budget lines imported');
});

export const approveBudget = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, budgetId } = req.params;
  return sendSuccess(res, await svc.approveBudget(organisationId, budgetId, req.user!.sub), 'Budget approved');
});

export const deleteBudget = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, budgetId } = req.params;
  await svc.deleteBudget(organisationId, budgetId);
  return sendNoContent(res);
});

export const getBudgetVsActual = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, budgetId } = req.params;
  const { costCentreId, rollup } = req.query as { costCentreId?: string; rollup?: string };
  const variance = await svc.getBudgetVsActual(
    organisationId, budgetId, costCentreId, rollup === 'true',
  );
  return sendSuccess(res, variance);
});

// ─── Commitments ──────────────────────────────────────────────────────────────

export const listCommitments = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, budgetId } = req.params;
  return sendSuccess(res, await svc.listCommitments(organisationId, budgetId));
});

export const createCommitment = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, budgetId } = req.params;
  const userId = req.user!.sub;
  const input = req.body as svc.CreateCommitmentInput;
  const commitment = await svc.createCommitment(organisationId, budgetId, userId, {
    ...input,
    referenceType: input.referenceType as CommitmentType,
  });
  return sendCreated(res, commitment, 'Commitment created');
});

export const updateCommitment = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, commitmentId } = req.params;
  const input = req.body as svc.UpdateCommitmentInput;
  const commitment = await svc.updateCommitment(organisationId, commitmentId, input);
  return sendSuccess(res, commitment, 'Commitment updated');
});

// ─── Segment Report (IFRS 8) ──────────────────────────────────────────────────

export const getSegmentReport = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const { fiscalYear } = req.query as { fiscalYear?: string };
  const report = await svc.getSegmentReport(
    organisationId,
    fiscalYear ? parseInt(fiscalYear, 10) : undefined,
  );
  return sendSuccess(res, report);
});

// ─── Cost Centres ─────────────────────────────────────────────────────────────

export const listCostCentres = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await svc.listCostCentres(req.params.organisationId));
});

export const createCostCentre = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const { code, name, description, level, parentId } = req.body as svc.CreateCostCentreInput;
  const cc = await svc.createCostCentre(organisationId, {
    code, name, description, level: level as CostCentreLevel | undefined, parentId,
  });
  return sendCreated(res, cc, 'Cost centre created');
});

export const updateCostCentre = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, id } = req.params;
  const cc = await svc.updateCostCentre(organisationId, id, req.body as svc.UpdateCostCentreInput);
  return sendSuccess(res, cc, 'Cost centre updated');
});

// ─── Departments ──────────────────────────────────────────────────────────────

export const listDepartments = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await svc.listDepartments(req.params.organisationId));
});

export const createDepartment = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const { code, name, description } = req.body as svc.CreateDepartmentInput;
  const dept = await svc.createDepartment(organisationId, { code, name, description });
  return sendCreated(res, dept, 'Department created');
});

export const updateDepartment = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, id } = req.params;
  const dept = await svc.updateDepartment(organisationId, id, req.body as svc.UpdateDepartmentInput);
  return sendSuccess(res, dept, 'Department updated');
});
