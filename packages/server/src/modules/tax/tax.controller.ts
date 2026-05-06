import { Request, Response } from 'express';
import { TaxTreatment, ExchangeRateType, VatReturnStatus } from '@prisma/client';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendCreated, sendNoContent } from '../../utils/response';
import { ValidationError } from '../../utils/errors';
import * as svc from './tax.service';

// ─── Tax Codes ────────────────────────────────────────────────────────────────

export const listTaxCodes = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined;
  return sendSuccess(res, await svc.listTaxCodes(organisationId, isActive));
});

export const getTaxCode = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, id } = req.params;
  return sendSuccess(res, await svc.getTaxCode(organisationId, id));
});

export const createTaxCode = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const { code, name, treatment, rate, isInclusive, glAccountId, description } = req.body as svc.CreateTaxCodeInput;
  if (!code) throw new ValidationError('code is required');
  if (!name) throw new ValidationError('name is required');
  if (rate === undefined) throw new ValidationError('rate is required');
  const tc = await svc.createTaxCode(organisationId, {
    code, name, treatment: treatment as TaxTreatment | undefined, rate, isInclusive, glAccountId, description,
  });
  return sendCreated(res, tc, `Tax code '${tc.code}' created`);
});

export const updateTaxCode = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, id } = req.params;
  const input = req.body as svc.UpdateTaxCodeInput;
  return sendSuccess(res, await svc.updateTaxCode(organisationId, id, input), 'Tax code updated');
});

export const deleteTaxCode = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, id } = req.params;
  await svc.deleteTaxCode(organisationId, id);
  return sendNoContent(res);
});

export const computeTax = asyncHandler(async (req: Request, res: Response) => {
  const { rate, amount, isInclusive } = req.body as { rate: number; amount: number; isInclusive?: boolean };
  if (rate === undefined || typeof rate !== 'number') throw new ValidationError('rate is required');
  if (amount === undefined || typeof amount !== 'number') throw new ValidationError('amount is required');
  if (amount < 0) throw new ValidationError('amount must be non-negative');
  return sendSuccess(res, svc.computeTax(rate, amount, isInclusive));
});

// ─── Exchange Rates ───────────────────────────────────────────────────────────

export const listExchangeRates = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const { fromCurrency, toCurrency, rateType } = req.query as {
    fromCurrency?: string; toCurrency?: string; rateType?: string;
  };
  return sendSuccess(res, await svc.listExchangeRates(organisationId, {
    fromCurrency, toCurrency, rateType: rateType as ExchangeRateType | undefined,
  }));
});

export const upsertExchangeRate = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const { fromCurrency, toCurrency, rate, rateType, effectiveDate } = req.body as svc.UpsertExchangeRateInput;
  if (!fromCurrency) throw new ValidationError('fromCurrency is required');
  if (!toCurrency) throw new ValidationError('toCurrency is required');
  if (rate === undefined) throw new ValidationError('rate is required');
  if (!effectiveDate || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
    throw new ValidationError('effectiveDate must be YYYY-MM-DD');
  }
  const er = await svc.upsertExchangeRate(organisationId, { fromCurrency, toCurrency, rate, rateType, effectiveDate });
  return sendCreated(res, er, 'Exchange rate recorded');
});

export const getLatestRate = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const { from, to, rateType } = req.query as { from?: string; to?: string; rateType?: string };
  if (!from) throw new ValidationError('Query param "from" is required');
  if (!to) throw new ValidationError('Query param "to" is required');
  return sendSuccess(res, await svc.getLatestRate(organisationId, from, to, rateType as ExchangeRateType | undefined));
});

// ─── VAT Return ───────────────────────────────────────────────────────────────

export const listVatReturns = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await svc.listVatReturns(req.params.organisationId));
});

export const generateVatReturn = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const { periodStart, periodEnd, notes } = req.body as svc.GenerateVatReturnInput;
  if (!periodStart || !/^\d{4}-\d{2}-\d{2}$/.test(periodStart)) throw new ValidationError('periodStart must be YYYY-MM-DD');
  if (!periodEnd || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) throw new ValidationError('periodEnd must be YYYY-MM-DD');
  const vr = await svc.generateVatReturn(organisationId, req.user!.sub, { periodStart, periodEnd, notes });
  return sendCreated(res, vr, 'VAT return generated');
});

export const getVatReturn = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, id } = req.params;
  return sendSuccess(res, await svc.getVatReturn(organisationId, id));
});

export const updateVatReturnStatus = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, id } = req.params;
  const { status } = req.body as { status: VatReturnStatus };
  if (!status) throw new ValidationError('status is required');
  return sendSuccess(res, await svc.updateVatReturnStatus(organisationId, id, status), 'VAT return updated');
});

export const deleteVatReturn = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, id } = req.params;
  await svc.deleteVatReturn(organisationId, id);
  return sendNoContent(res);
});

// ─── FX Revaluation ───────────────────────────────────────────────────────────

export const listFxRevaluations = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await svc.listFxRevaluations(req.params.organisationId));
});

export const runFxRevaluation = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const { periodEndDate, notes } = req.body as svc.RunFxRevaluationInput;
  if (!periodEndDate || !/^\d{4}-\d{2}-\d{2}$/.test(periodEndDate)) {
    throw new ValidationError('periodEndDate must be YYYY-MM-DD');
  }
  const rev = await svc.runFxRevaluation(organisationId, req.user!.sub, { periodEndDate, notes });
  return sendCreated(res, rev, 'FX revaluation run completed');
});

export const getFxRevaluation = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, id } = req.params;
  return sendSuccess(res, await svc.getFxRevaluation(organisationId, id));
});

export const reverseFxRevaluation = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, id } = req.params;
  return sendSuccess(res, await svc.reverseFxRevaluation(organisationId, id), 'FX revaluation reversed');
});
