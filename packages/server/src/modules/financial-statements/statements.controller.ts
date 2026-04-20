import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/response';
import * as statementsService from './statements.service';

export const getBalanceSheet = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const { asOfDate, periodId } = req.query as Record<string, string | undefined>;
  const data = await statementsService.getBalanceSheet(organisationId, { asOfDate, periodId });
  return sendSuccess(res, data, 'Balance sheet generated');
});

export const getIncomeStatement = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const { fromDate, toDate, periodId } = req.query as Record<string, string | undefined>;
  const data = await statementsService.getIncomeStatement(organisationId, { fromDate, toDate, periodId });
  return sendSuccess(res, data, 'Income statement generated');
});

export const getCashFlowStatement = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const { fromDate, toDate, periodId } = req.query as Record<string, string | undefined>;
  const data = await statementsService.getCashFlowStatement(organisationId, { fromDate, toDate, periodId });
  return sendSuccess(res, data, 'Cash flow statement generated');
});

export const getChangesInEquity = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const { fromDate, toDate, periodId } = req.query as Record<string, string | undefined>;
  const data = await statementsService.getChangesInEquity(organisationId, { fromDate, toDate, periodId });
  return sendSuccess(res, data, 'Statement of changes in equity generated');
});
