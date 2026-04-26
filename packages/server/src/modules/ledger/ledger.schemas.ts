import { z } from 'zod';

export const ledgerQuerySchema = z.object({
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  periodId: z.string().uuid().optional(),
  page: z
    .string()
    .default('1')
    .transform((v) => Math.max(1, parseInt(v, 10))),
  pageSize: z
    .string()
    .default('100')
    .transform((v) => Math.min(500, Math.max(1, parseInt(v, 10)))),
});

export const trialBalanceQuerySchema = z.object({
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  periodId: z.string().uuid().optional(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  includeZeroBalances: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
});
