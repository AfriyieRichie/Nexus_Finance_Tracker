import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/response';
import * as statementsService from './statements.service';

export const getBalanceSheet = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const { asOfDate, periodId, compareTo, showZero } = req.query as Record<string, string | undefined>;
  const data = await statementsService.getBalanceSheet(organisationId, {
    asOfDate,
    periodId,
    compareTo: compareTo as 'prior_period' | 'prior_year' | undefined,
    showZero: showZero === 'true',
  });
  return sendSuccess(res, data, 'Balance sheet generated');
});

export const getBalanceSheetDrilldown = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const { accountId, asOfDate } = req.query as Record<string, string | undefined>;
  if (!accountId) {
    res.status(400).json({ success: false, error: 'accountId is required' });
    return;
  }
  const effectiveDate = asOfDate ?? new Date().toISOString().slice(0, 10);
  const data = await statementsService.getBalanceSheetDrilldown(organisationId, accountId as string, effectiveDate);
  return sendSuccess(res, data, 'Drilldown loaded');
});

export const getIncomeStatement = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const { fromDate, toDate, periodId, comparisons, showZero } = req.query as Record<string, string | undefined>;
  const parsedComparisons = comparisons
    ? (comparisons.split(',').filter((c) => c === 'prior_period' || c === 'prior_year') as ('prior_period' | 'prior_year')[])
    : undefined;
  const data = await statementsService.getIncomeStatement(organisationId, {
    fromDate, toDate, periodId,
    comparisons: parsedComparisons,
    showZero: showZero === 'true',
  });
  return sendSuccess(res, data, 'Income statement generated');
});

export const getIncomeStatementDrilldown = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const { accountId, fromDate, toDate } = req.query as Record<string, string | undefined>;
  if (!accountId) {
    res.status(400).json({ success: false, error: 'accountId is required' });
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  const data = await statementsService.getIncomeStatementDrilldown(
    organisationId,
    accountId as string,
    fromDate ?? `${today.slice(0, 4)}-01-01`,
    toDate   ?? today,
  );
  return sendSuccess(res, data, 'Drilldown loaded');
});

export const getCashFlowStatement = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const { fromDate, toDate, periodId, comparisons } = req.query as Record<string, string | undefined>;
  const parsedComparisons = comparisons
    ? (comparisons.split(',').filter((c) => c === 'prior_period' || c === 'prior_year') as ('prior_period' | 'prior_year')[])
    : undefined;
  const data = await statementsService.getCashFlowStatement(organisationId, {
    fromDate, toDate, periodId, comparisons: parsedComparisons,
  });
  return sendSuccess(res, data, 'Cash flow statement generated');
});

export const getChangesInEquity = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const { fromDate, toDate, periodId } = req.query as Record<string, string | undefined>;
  const data = await statementsService.getChangesInEquity(organisationId, { fromDate, toDate, periodId });
  return sendSuccess(res, data, 'Statement of changes in equity generated');
});
