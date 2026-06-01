import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendCreated, sendNoContent } from '../../utils/response';
import * as svc from './budgets.service';
import {
  createBudgetSchema,
  updateBudgetSchema,
  copyBudgetSchema,
  updateBudgetLinesSchema,
  importBudgetLinesSchema,
  budgetVsActualQuerySchema,
  createCommitmentSchema,
  updateCommitmentSchema,
  createCostCentreSchema,
  updateCostCentreSchema,
  createDepartmentSchema,
  updateDepartmentSchema,
  segmentReportQuerySchema,
} from './budgets.schemas';

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
  const input = createBudgetSchema.parse(req.body);
  const budget = await svc.createBudget(organisationId, req.user!.sub, input);
  return sendCreated(res, budget, 'Budget created');
});

export const updateBudget = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, budgetId } = req.params;
  const input = updateBudgetSchema.parse(req.body);
  const budget = await svc.updateBudget(organisationId, budgetId, input);
  return sendSuccess(res, budget, 'Budget updated');
});

export const copyBudget = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, budgetId } = req.params;
  const input = copyBudgetSchema.parse(req.body);
  const budget = await svc.copyBudget(organisationId, req.user!.sub, {
    sourceBudgetId: budgetId,
    targetFiscalYear: input.targetFiscalYear,
    targetName: input.targetName,
    upliftPct: input.upliftPct,
  });
  return sendCreated(res, budget, 'Budget copied');
});

export const updateBudgetLines = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, budgetId } = req.params;
  const { lines } = updateBudgetLinesSchema.parse(req.body);
  return sendSuccess(res, await svc.updateBudgetLines(organisationId, budgetId, lines), 'Budget lines updated');
});

export const importBudgetLines = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, budgetId } = req.params;
  const { rows } = importBudgetLinesSchema.parse(req.body);
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
  const query = budgetVsActualQuerySchema.parse(req.query);
  const variance = await svc.getBudgetVsActual(
    organisationId,
    budgetId,
    query.costCentreId,
    query.rollup,
    query.byPeriod,
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
  const input = createCommitmentSchema.parse(req.body);
  const commitment = await svc.createCommitment(organisationId, budgetId, req.user!.sub, input);
  return sendCreated(res, commitment, 'Commitment created');
});

export const updateCommitment = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, commitmentId } = req.params;
  const input = updateCommitmentSchema.parse(req.body);
  const commitment = await svc.updateCommitment(organisationId, commitmentId, input);
  return sendSuccess(res, commitment, 'Commitment updated');
});

// ─── Segment Report (IFRS 8) ──────────────────────────────────────────────────

export const getSegmentReport = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const { fiscalYear } = segmentReportQuerySchema.parse(req.query);
  const report = await svc.getSegmentReport(organisationId, fiscalYear);
  return sendSuccess(res, report);
});

// ─── Cost Centres ─────────────────────────────────────────────────────────────

export const listCostCentres = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await svc.listCostCentres(req.params.organisationId));
});

export const createCostCentre = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const input = createCostCentreSchema.parse(req.body);
  const cc = await svc.createCostCentre(organisationId, input);
  return sendCreated(res, cc, 'Cost centre created');
});

export const updateCostCentre = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, id } = req.params;
  const input = updateCostCentreSchema.parse(req.body);
  const cc = await svc.updateCostCentre(organisationId, id, input);
  return sendSuccess(res, cc, 'Cost centre updated');
});

// ─── Departments ──────────────────────────────────────────────────────────────

export const listDepartments = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await svc.listDepartments(req.params.organisationId));
});

export const createDepartment = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const input = createDepartmentSchema.parse(req.body);
  const dept = await svc.createDepartment(organisationId, input);
  return sendCreated(res, dept, 'Department created');
});

export const updateDepartment = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, id } = req.params;
  const input = updateDepartmentSchema.parse(req.body);
  const dept = await svc.updateDepartment(organisationId, id, input);
  return sendSuccess(res, dept, 'Department updated');
});
