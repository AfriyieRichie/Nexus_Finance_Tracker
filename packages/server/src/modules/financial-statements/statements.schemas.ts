import { z } from 'zod';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const balanceSheetQuerySchema = z.object({
  asOfDate:  z.string().regex(dateRegex).optional(),
  periodId:  z.string().uuid().optional(),
  compareTo: z.enum(['prior_period', 'prior_year']).optional(),
  showZero:  z.coerce.boolean().default(false),
});

export const balanceSheetDrilldownQuerySchema = z.object({
  accountId: z.string().uuid(),
  asOfDate:  z.string().regex(dateRegex).optional(),
});

export const incomeStatementQuerySchema = z.object({
  fromDate:    z.string().regex(dateRegex).optional(),
  toDate:      z.string().regex(dateRegex).optional(),
  periodId:    z.string().uuid().optional(),
  comparisons: z.string().optional(),
  showZero:    z.coerce.boolean().default(false),
});

export const incomeStatementDrilldownQuerySchema = z.object({
  accountId: z.string().uuid(),
  fromDate:  z.string().regex(dateRegex).optional(),
  toDate:    z.string().regex(dateRegex).optional(),
});

export const cashFlowQuerySchema = z.object({
  fromDate:    z.string().regex(dateRegex).optional(),
  toDate:      z.string().regex(dateRegex).optional(),
  periodId:    z.string().uuid().optional(),
  comparisons: z.string().optional(),
});

export const changesInEquityQuerySchema = z.object({
  fromDate: z.string().regex(dateRegex).optional(),
  toDate:   z.string().regex(dateRegex).optional(),
  periodId: z.string().uuid().optional(),
});
