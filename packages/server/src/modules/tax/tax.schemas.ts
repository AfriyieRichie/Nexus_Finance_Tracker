import { z } from 'zod';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

// ─── Tax Codes ────────────────────────────────────────────────────────────────

export const createTaxCodeSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(100),
  treatment: z.enum(['STANDARD', 'ZERO_RATED', 'EXEMPT', 'REVERSE_CHARGE', 'IMPORT_VAT', 'WITHHOLDING']).optional(),
  rate: z.number().min(0).max(100),
  isInclusive: z.boolean().optional(),
  glAccountId: z.string().uuid().optional(),
  description: z.string().optional(),
});

export const updateTaxCodeSchema = createTaxCodeSchema.partial().extend({
  glAccountId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
});

export const computeTaxSchema = z.object({
  rate: z.number().min(0).max(100),
  amount: z.number().nonnegative(),
  isInclusive: z.boolean().optional(),
});

// ─── Exchange Rates ───────────────────────────────────────────────────────────

export const upsertExchangeRateSchema = z.object({
  fromCurrency: z.string().length(3),
  toCurrency: z.string().length(3),
  rate: z.number().positive(),
  rateType: z.enum(['SPOT', 'MONTHLY_AVERAGE', 'PERIOD_CLOSING']).optional(),
  effectiveDate: z.string().regex(dateRegex),
});

export const latestRateQuerySchema = z.object({
  from: z.string().length(3),
  to: z.string().length(3),
  rateType: z.enum(['SPOT', 'MONTHLY_AVERAGE', 'PERIOD_CLOSING']).optional(),
});

export const listExchangeRatesQuerySchema = z.object({
  fromCurrency: z.string().length(3).optional(),
  toCurrency: z.string().length(3).optional(),
  rateType: z.enum(['SPOT', 'MONTHLY_AVERAGE', 'PERIOD_CLOSING']).optional(),
});

// ─── VAT Returns ─────────────────────────────────────────────────────────────

export const generateVatReturnSchema = z.object({
  periodStart: z.string().regex(dateRegex),
  periodEnd: z.string().regex(dateRegex),
  notes: z.string().optional(),
});

export const updateVatReturnStatusSchema = z.object({
  status: z.enum(['DRAFT', 'SUBMITTED', 'FILED']),
});

// ─── Tax Centre (liability report) ────────────────────────────────────────────

export const taxSummaryQuerySchema = z.object({
  from: z.string().regex(dateRegex),
  to: z.string().regex(dateRegex),
});

export const taxTransactionsQuerySchema = z.object({
  from: z.string().regex(dateRegex),
  to: z.string().regex(dateRegex),
  taxCode: z.string().min(1),
  direction: z.enum(['OUTPUT', 'INPUT', 'ALL']).optional().default('ALL'),
});

// ─── FX Revaluation ──────────────────────────────────────────────────────────

export const runFxRevaluationSchema = z.object({
  periodEndDate: z.string().regex(dateRegex),
  periodId: z.string().uuid(),
  fxGainLossAccountId: z.string().uuid(),
  notes: z.string().optional(),
});

export const reverseFxRevaluationSchema = z.object({
  reverseDate: z.string().regex(dateRegex),
  periodId: z.string().uuid(),
});

// ─── Exported types ───────────────────────────────────────────────────────────

export type CreateTaxCodeInput = z.infer<typeof createTaxCodeSchema>;
export type UpdateTaxCodeInput = z.infer<typeof updateTaxCodeSchema>;
export type ComputeTaxInput = z.infer<typeof computeTaxSchema>;
export type UpsertExchangeRateInput = z.infer<typeof upsertExchangeRateSchema>;
export type GenerateVatReturnInput = z.infer<typeof generateVatReturnSchema>;
export type TaxSummaryQuery = z.infer<typeof taxSummaryQuerySchema>;
export type TaxTransactionsQuery = z.infer<typeof taxTransactionsQuerySchema>;
export type RunFxRevaluationInput = z.infer<typeof runFxRevaluationSchema>;
export type ReverseFxRevaluationInput = z.infer<typeof reverseFxRevaluationSchema>;
