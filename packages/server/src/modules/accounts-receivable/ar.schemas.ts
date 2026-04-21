import { z } from 'zod';

// ─── Customer ────────────────────────────────────────────────────────────────

export const createCustomerSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(200),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.record(z.unknown()).optional(),
  taxId: z.string().optional(),
  creditLimit: z.number().positive().optional(),
  paymentTerms: z.number().int().min(0).default(30),
});

export const updateCustomerSchema = createCustomerSchema.partial();

export const listCustomersSchema = z.object({
  search: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
});

// ─── Invoice ─────────────────────────────────────────────────────────────────

export const invoiceLineSchema = z.object({
  lineNumber: z.number().int().positive(),
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  taxCode: z.string().optional(),
  taxAmount: z.number().nonnegative().default(0),
  accountId: z.string().uuid().optional(),
});

export const createInvoiceSchema = z.object({
  customerId: z.string().uuid(),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currency: z.string().length(3),
  exchangeRate: z.number().positive().default(1),
  notes: z.string().optional(),
  lines: z.array(invoiceLineSchema).min(1),
  arAccountId: z.string().uuid(),
});

export const listInvoicesSchema = z.object({
  customerId: z.string().uuid().optional(),
  status: z.enum(['DRAFT', 'POSTED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
});

export const recordPaymentSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: z.number().positive(),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  bankAccountId: z.string().uuid(),
  periodId: z.string().uuid(),
  reference: z.string().optional(),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type ListCustomersQuery = z.infer<typeof listCustomersSchema>;
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type ListInvoicesQuery = z.infer<typeof listInvoicesSchema>;
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
