import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendCreated, sendNoContent } from '../../utils/response';
import { ValidationError } from '../../utils/errors';
import * as taxService from './tax.service';

// ─── Tax Code Handlers ────────────────────────────────────────────────────────

export const listTaxCodes = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;

  let isActive: boolean | undefined;
  if (req.query.isActive !== undefined) {
    isActive = req.query.isActive === 'true';
  }

  const taxCodes = await taxService.listTaxCodes(organisationId, isActive);
  return sendSuccess(res, taxCodes);
});

export const getTaxCode = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, id } = req.params;
  const taxCode = await taxService.getTaxCode(organisationId, id);
  return sendSuccess(res, taxCode);
});

export const createTaxCode = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const { code, name, rate, description } = req.body as {
    code: string;
    name: string;
    rate: number;
    description?: string;
  };

  if (!code || typeof code !== 'string') {
    throw new ValidationError('code is required');
  }
  if (!name || typeof name !== 'string') {
    throw new ValidationError('name is required');
  }
  if (rate === undefined || typeof rate !== 'number') {
    throw new ValidationError('rate is required and must be a number');
  }

  const taxCode = await taxService.createTaxCode(organisationId, {
    code,
    name,
    rate,
    description,
  });
  return sendCreated(res, taxCode, `Tax code '${taxCode.code}' created`);
});

export const updateTaxCode = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, id } = req.params;
  const { name, rate, description, isActive } = req.body as {
    name?: string;
    rate?: number;
    description?: string;
    isActive?: boolean;
  };

  const taxCode = await taxService.updateTaxCode(organisationId, id, {
    name,
    rate,
    description,
    isActive,
  });
  return sendSuccess(res, taxCode, 'Tax code updated');
});

export const deleteTaxCode = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, id } = req.params;
  await taxService.deleteTaxCode(organisationId, id);
  return sendNoContent(res);
});

export const computeTax = asyncHandler(async (req: Request, res: Response) => {
  const { rate, amount } = req.body as { rate: number; amount: number };

  if (rate === undefined || typeof rate !== 'number') {
    throw new ValidationError('rate is required and must be a number');
  }
  if (amount === undefined || typeof amount !== 'number') {
    throw new ValidationError('amount is required and must be a number');
  }
  if (amount < 0) {
    throw new ValidationError('amount must be non-negative');
  }

  const result = taxService.computeTax(rate, amount);
  return sendSuccess(res, result);
});

// ─── Exchange Rate Handlers ───────────────────────────────────────────────────

export const listExchangeRates = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const { fromCurrency, toCurrency } = req.query as {
    fromCurrency?: string;
    toCurrency?: string;
  };

  const rates = await taxService.listExchangeRates(organisationId, {
    fromCurrency,
    toCurrency,
  });
  return sendSuccess(res, rates);
});

export const upsertExchangeRate = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const { fromCurrency, toCurrency, rate, effectiveDate } = req.body as {
    fromCurrency: string;
    toCurrency: string;
    rate: number;
    effectiveDate: string;
  };

  if (!fromCurrency || typeof fromCurrency !== 'string') {
    throw new ValidationError('fromCurrency is required');
  }
  if (!toCurrency || typeof toCurrency !== 'string') {
    throw new ValidationError('toCurrency is required');
  }
  if (rate === undefined || typeof rate !== 'number') {
    throw new ValidationError('rate is required and must be a number');
  }
  if (!effectiveDate || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
    throw new ValidationError('effectiveDate is required and must be YYYY-MM-DD');
  }

  const exchangeRate = await taxService.upsertExchangeRate(organisationId, {
    fromCurrency,
    toCurrency,
    rate,
    effectiveDate,
  });
  return sendCreated(res, exchangeRate, 'Exchange rate recorded');
});

export const getLatestRate = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const { from, to } = req.query as { from?: string; to?: string };

  if (!from) throw new ValidationError('Query param "from" is required');
  if (!to) throw new ValidationError('Query param "to" is required');

  const rate = await taxService.getLatestRate(organisationId, from, to);
  return sendSuccess(res, rate);
});
