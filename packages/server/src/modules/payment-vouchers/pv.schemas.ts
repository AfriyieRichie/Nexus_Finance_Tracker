import { z } from 'zod';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const createPvSchema = z.object({
  supplierId: z.string().uuid(),
  voucherDate: z.string().regex(dateRegex),
  bankAccountId: z.string().uuid().optional(),
  payeeMemo: z.string().optional(),
  notes: z.string().optional(),
  applyWht: z.boolean().default(true),
  lines: z.array(z.object({
    supplierInvoiceId: z.string().uuid(),
    amount: z.number().positive(),
  })).min(1),
});

export const listPvSchema = z.object({
  status: z.string().optional(),
  supplierId: z.string().uuid().optional(),
});

export const payPvSchema = z.object({
  bankAccountId: z.string().uuid().optional(),
});

export const rejectPvSchema = z.object({ reason: z.string().min(1) });

export type CreatePvInput = z.infer<typeof createPvSchema>;
export type ListPvQuery = z.infer<typeof listPvSchema>;
export type PayPvInput = z.infer<typeof payPvSchema>;
