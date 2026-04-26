import { z } from 'zod';
import { PeriodStatus } from '@prisma/client';

export const createFiscalYearSchema = z.object({
  fiscalYear: z
    .number()
    .int()
    .min(2000)
    .max(2100),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD'),
});

export const updatePeriodStatusSchema = z.object({
  status: z.nativeEnum(PeriodStatus),
});

export const reopenPeriodSchema = z.object({
  reason: z.string().min(5, 'Reason must be at least 5 characters'),
});

export type ReopenPeriodInput = z.infer<typeof reopenPeriodSchema>;

export const listPeriodsSchema = z.object({
  fiscalYear: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : undefined)),
  status: z.nativeEnum(PeriodStatus).optional(),
});

export type CreateFiscalYearInput = z.infer<typeof createFiscalYearSchema>;
export type UpdatePeriodStatusInput = z.infer<typeof updatePeriodStatusSchema>;
export type ListPeriodsQuery = z.infer<typeof listPeriodsSchema>;
