import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/response';
import { ledgerQuerySchema, trialBalanceQuerySchema } from './ledger.schemas';
import * as ledgerService from './ledger.service';

export const getAccountLedger = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, accountId } = req.params;
  const query = ledgerQuerySchema.parse(req.query);
  const result = await ledgerService.getAccountLedger(organisationId, accountId, query);

  return sendSuccess(res, {
    account: result.account,
    openingBalance: result.openingBalance.toFixed(4),
    entries: result.entries,
    pagination: {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: Math.ceil(result.total / result.pageSize),
      hasNext: result.page < Math.ceil(result.total / result.pageSize),
      hasPrev: result.page > 1,
    },
  });
});

export const getTrialBalance = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const query = trialBalanceQuerySchema.parse(req.query);
  const result = await ledgerService.getTrialBalance(organisationId, {
    asOfDate: query.asOfDate,
    periodId: query.periodId,
    includeZeroBalances: query.includeZeroBalances,
  });
  return sendSuccess(res, result);
});

export const getLedgerSummary = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, periodId } = req.params;
  const result = await ledgerService.getLedgerSummary(organisationId, periodId);
  return sendSuccess(res, result);
});
