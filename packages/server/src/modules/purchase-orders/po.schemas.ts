import { z } from 'zod';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const poLineSchema = z.object({
  description: z.string().min(1).max(300),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  accountId: z.string().uuid().optional(),
  taxCode: z.string().optional(),
  taxAmount: z.coerce.number().nonnegative().default(0),
});

export const createPoSchema = z.object({
  supplierId: z.string().uuid(),
  orderDate: z.string().regex(dateRegex),
  expectedDate: z.string().regex(dateRegex).optional(),
  currency: z.string().length(3),
  notes: z.string().optional(),
  lines: z.array(poLineSchema).min(1),
});

export const updatePoSchema = createPoSchema.partial();

export const listPoSchema = z.object({
  status: z.string().optional(),
  supplierId: z.string().uuid().optional(),
});

export const convertToBillSchema = z.object({
  dueDate: z.string().regex(dateRegex).optional(),
  supplierRef: z.string().optional(),
  apAccountId: z.string().uuid().optional(),
});

export const rejectPoSchema = z.object({ reason: z.string().min(1) });
export const approvePoSchema = z.object({ comments: z.string().optional() });

export type CreatePoInput = z.infer<typeof createPoSchema>;
export type UpdatePoInput = z.infer<typeof updatePoSchema>;
export type ListPoQuery = z.infer<typeof listPoSchema>;
export type ConvertToBillInput = z.infer<typeof convertToBillSchema>;
