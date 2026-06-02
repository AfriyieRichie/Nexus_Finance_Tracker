import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/response';
import * as svc from './statements.service';
import {
  balanceSheetQuerySchema,
  balanceSheetDrilldownQuerySchema,
  incomeStatementQuerySchema,
  incomeStatementDrilldownQuerySchema,
  cashFlowQuerySchema,
  changesInEquityQuerySchema,
} from './statements.schemas';

export const getBalanceSheet = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const query = balanceSheetQuerySchema.parse(req.query);
  const data = await svc.getBalanceSheet(organisationId, {
    asOfDate:  query.asOfDate,
    periodId:  query.periodId,
    compareTo: query.compareTo,
    showZero:  query.showZero,
  });
  return sendSuccess(res, data, 'Balance sheet generated');
});

export const getBalanceSheetDrilldown = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const { accountId, asOfDate } = balanceSheetDrilldownQuerySchema.parse(req.query);
  const effectiveDate = asOfDate ?? new Date().toISOString().slice(0, 10);
  const data = await svc.getBalanceSheetDrilldown(organisationId, accountId, effectiveDate);
  return sendSuccess(res, data, 'Drilldown loaded');
});

export const getIncomeStatement = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const query = incomeStatementQuerySchema.parse(req.query);
  const parsedComparisons = query.comparisons
    ? (query.comparisons.split(',').filter((c) => c === 'prior_period' || c === 'prior_year') as ('prior_period' | 'prior_year')[])
    : undefined;
  const data = await svc.getIncomeStatement(organisationId, {
    fromDate:    query.fromDate,
    toDate:      query.toDate,
    periodId:    query.periodId,
    comparisons: parsedComparisons,
    showZero:    query.showZero,
  });
  return sendSuccess(res, data, 'Income statement generated');
});

export const getIncomeStatementDrilldown = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const { accountId, fromDate, toDate } = incomeStatementDrilldownQuerySchema.parse(req.query);
  const today = new Date().toISOString().slice(0, 10);
  const data = await svc.getIncomeStatementDrilldown(
    organisationId,
    accountId,
    fromDate ?? `${today.slice(0, 4)}-01-01`,
    toDate   ?? today,
  );
  return sendSuccess(res, data, 'Drilldown loaded');
});

export const getCashFlowStatement = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const query = cashFlowQuerySchema.parse(req.query);
  const parsedComparisons = query.comparisons
    ? (query.comparisons.split(',').filter((c) => c === 'prior_period' || c === 'prior_year') as ('prior_period' | 'prior_year')[])
    : undefined;
  const data = await svc.getCashFlowStatement(organisationId, {
    fromDate:    query.fromDate,
    toDate:      query.toDate,
    periodId:    query.periodId,
    comparisons: parsedComparisons,
  });
  return sendSuccess(res, data, 'Cash flow statement generated');
});

export const getChangesInEquity = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const query = changesInEquityQuerySchema.parse(req.query);
  const data = await svc.getChangesInEquity(organisationId, query);
  return sendSuccess(res, data, 'Statement of changes in equity generated');
});
