import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { sendSuccess, sendCreated } from '../../utils/response';
import {
  createFiscalYearSchema,
  listPeriodsSchema,
} from './periods.schemas';
import * as periodsService from './periods.service';

export const createFiscalYear = async (req: AuthenticatedRequest, res: Response) => {
  const { organisationId } = req.params;
  const input = createFiscalYearSchema.parse(req.body);
  const periods = await periodsService.createFiscalYear(organisationId, input, req.user!.sub);
  sendCreated(res, periods, `Fiscal year ${input.fiscalYear} created with ${periods.length} periods`);
};

export const listPeriods = async (req: AuthenticatedRequest, res: Response) => {
  const { organisationId } = req.params;
  const query = listPeriodsSchema.parse(req.query);
  const periods = await periodsService.listPeriods(organisationId, query);
  sendSuccess(res, periods);
};

export const getPeriod = async (req: AuthenticatedRequest, res: Response) => {
  const { organisationId, periodId } = req.params;
  const period = await periodsService.getPeriod(organisationId, periodId);
  sendSuccess(res, period);
};

export const getCurrentPeriod = async (req: AuthenticatedRequest, res: Response) => {
  const { organisationId } = req.params;
  const period = await periodsService.getCurrentPeriod(organisationId);
  sendSuccess(res, period);
};

export const closePeriod = async (req: AuthenticatedRequest, res: Response) => {
  const { organisationId, periodId } = req.params;
  const period = await periodsService.closePeriod(organisationId, periodId, req.user!.sub);
  sendSuccess(res, period, 'Period closed successfully');
};

export const reopenPeriod = async (req: AuthenticatedRequest, res: Response) => {
  const { organisationId, periodId } = req.params;
  const period = await periodsService.reopenPeriod(organisationId, periodId);
  sendSuccess(res, period, 'Period reopened');
};

export const lockPeriod = async (req: AuthenticatedRequest, res: Response) => {
  const { organisationId, periodId } = req.params;
  const period = await periodsService.lockPeriod(organisationId, periodId, req.user!.sub);
  sendSuccess(res, period, 'Period permanently locked');
};

export const yearEndClose = async (req: AuthenticatedRequest, res: Response) => {
  const { organisationId } = req.params;
  const { fiscalYear } = req.body;
  if (!fiscalYear || typeof fiscalYear !== 'number') {
    throw new Error('fiscalYear (number) is required');
  }
  const result = await periodsService.yearEndClose(organisationId, fiscalYear, req.user!.sub);
  sendSuccess(res, result, `Year-end close: ${result.locked} periods permanently locked`);
};
