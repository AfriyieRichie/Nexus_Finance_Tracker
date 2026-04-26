import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendCreated } from '../../utils/response';
import {
  createFiscalYearSchema,
  listPeriodsSchema,
  reopenPeriodSchema,
} from './periods.schemas';
import * as periodsService from './periods.service';

export const createFiscalYear = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const input = createFiscalYearSchema.parse(req.body);
  const periods = await periodsService.createFiscalYear(organisationId, input, req.user!.sub);
  return sendCreated(res, periods, `Fiscal year ${input.fiscalYear} created with ${periods.length} periods`);
});

export const listPeriods = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const query = listPeriodsSchema.parse(req.query);
  const periods = await periodsService.listPeriods(organisationId, query);
  return sendSuccess(res, periods);
});

export const getPeriod = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, periodId } = req.params;
  const period = await periodsService.getPeriod(organisationId, periodId);
  return sendSuccess(res, period);
});

export const getCurrentPeriod = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const period = await periodsService.getCurrentPeriod(organisationId);
  return sendSuccess(res, period);
});

export const closePeriod = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, periodId } = req.params;
  const period = await periodsService.closePeriod(organisationId, periodId, req.user!.sub);
  return sendSuccess(res, period, 'Period closed successfully');
});

export const reopenPeriod = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, periodId } = req.params;
  const { reason } = reopenPeriodSchema.parse(req.body);
  const period = await periodsService.reopenPeriod(organisationId, periodId, req.user!.sub, reason);
  return sendSuccess(res, period, 'Period reopened');
});

export const lockPeriod = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, periodId } = req.params;
  const period = await periodsService.lockPeriod(organisationId, periodId, req.user!.sub);
  return sendSuccess(res, period, 'Period permanently locked');
});

export const yearEndClose = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const { fiscalYear } = req.body as { fiscalYear?: number };
  if (!fiscalYear || typeof fiscalYear !== 'number') {
    throw new Error('fiscalYear (number) is required');
  }
  const result = await periodsService.yearEndClose(organisationId, fiscalYear, req.user!.sub);
  return sendSuccess(res, result, `Year-end close: ${result.locked} periods permanently locked`);
});
