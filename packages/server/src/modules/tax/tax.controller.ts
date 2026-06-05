import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendCreated, sendNoContent } from '../../utils/response';
import * as svc from './tax.service';
import {
  createTaxCodeSchema,
  updateTaxCodeSchema,
  computeTaxSchema,
  upsertExchangeRateSchema,
  latestRateQuerySchema,
  listExchangeRatesQuerySchema,
  generateVatReturnSchema,
  updateVatReturnStatusSchema,
  runFxRevaluationSchema,
  reverseFxRevaluationSchema,
  taxSummaryQuerySchema,
  taxTransactionsQuerySchema,
} from './tax.schemas';

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
  const input = createTaxCodeSchema.parse(req.body);
  const tc = await svc.createTaxCode(organisationId, input);
  return sendCreated(res, tc, `Tax code '${tc.code}' created`);
});

export const updateTaxCode = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, id } = req.params;
  const input = updateTaxCodeSchema.parse(req.body);
  return sendSuccess(res, await svc.updateTaxCode(organisationId, id, input), 'Tax code updated');
});

export const deleteTaxCode = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, id } = req.params;
  await svc.deleteTaxCode(organisationId, id);
  return sendNoContent(res);
});

export const computeTax = asyncHandler(async (req: Request, res: Response) => {
  const { rate, amount, isInclusive } = computeTaxSchema.parse(req.body);
  return sendSuccess(res, svc.computeTax(rate, amount, isInclusive));
});

// ─── Exchange Rates ───────────────────────────────────────────────────────────

export const listExchangeRates = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const query = listExchangeRatesQuerySchema.parse(req.query);
  return sendSuccess(res, await svc.listExchangeRates(organisationId, query));
});

export const upsertExchangeRate = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const input = upsertExchangeRateSchema.parse(req.body);
  const er = await svc.upsertExchangeRate(organisationId, input);
  return sendCreated(res, er, 'Exchange rate recorded');
});

export const getLatestRate = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const { from, to, rateType } = latestRateQuerySchema.parse(req.query);
  return sendSuccess(res, await svc.getLatestRate(organisationId, from, to, rateType as svc.ListExchangeRatesParams['rateType']));
});

// ─── VAT Return ───────────────────────────────────────────────────────────────

export const listVatReturns = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await svc.listVatReturns(req.params.organisationId));
});

export const generateVatReturn = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const input = generateVatReturnSchema.parse(req.body);
  const vr = await svc.generateVatReturn(organisationId, req.user!.sub, input);
  return sendCreated(res, vr, 'VAT return generated');
});

// ─── Tax Centre ───────────────────────────────────────────────────────────────

export const getTaxSummary = asyncHandler(async (req: Request, res: Response) => {
  const query = taxSummaryQuerySchema.parse(req.query);
  return sendSuccess(res, await svc.getTaxSummary(req.params.organisationId, query));
});

export const getTaxTransactions = asyncHandler(async (req: Request, res: Response) => {
  const query = taxTransactionsQuerySchema.parse(req.query);
  return sendSuccess(res, await svc.getTaxTransactions(req.params.organisationId, query));
});

export const getVatReturn = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, id } = req.params;
  return sendSuccess(res, await svc.getVatReturn(organisationId, id));
});

export const updateVatReturnStatus = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, id } = req.params;
  const { status } = updateVatReturnStatusSchema.parse(req.body);
  return sendSuccess(res, await svc.updateVatReturnStatus(organisationId, id, status as Parameters<typeof svc.updateVatReturnStatus>[2]), 'VAT return updated');
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
  const input = runFxRevaluationSchema.parse(req.body);
  const rev = await svc.runFxRevaluation(organisationId, req.user!.sub, input);
  return sendCreated(res, rev, 'FX revaluation run completed and GL posted');
});

export const getFxRevaluation = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, id } = req.params;
  return sendSuccess(res, await svc.getFxRevaluation(organisationId, id));
});

export const reverseFxRevaluation = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, id } = req.params;
  const input = reverseFxRevaluationSchema.parse(req.body);
  return sendSuccess(res, await svc.reverseFxRevaluation(organisationId, id, req.user!.sub, input), 'FX revaluation reversed');
});
