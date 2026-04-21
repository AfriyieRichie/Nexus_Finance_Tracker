import { z } from 'zod';

export const createSupplierSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(200),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.record(z.unknown()).optional(),
  taxId: z.string().optional(),
  paymentTerms: z.number().int().min(0).default(30),
  bankDetails: z.record(z.unknown()).optional(),
});

export const updateSupplierSchema = createSupplierSchema.partial();

export const listSuppliersSchema = z.object({
  search: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
});

export const supplierInvoiceLineSchema = z.object({
  lineNumber: z.number().int().positive(),
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  taxCode: z.string().optional(),
  taxAmount: z.number().nonnegative().default(0),
  accountId: z.string().uuid().optional(),
});

export const createSupplierInvoiceSchema = z.object({
  supplierId: z.string().uuid(),
  supplierRef: z.string().optional(),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currency: z.string().length(3),
  exchangeRate: z.number().positive().default(1),
  notes: z.string().optional(),
  lines: z.array(supplierInvoiceLineSchema).min(1),
});

export const listSupplierInvoicesSchema = z.object({
  supplierId: z.string().uuid().optional(),
  status: z.enum(['DRAFT', 'POSTED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
});

export const recordSupplierPaymentSchema = z.object({
  supplierInvoiceId: z.string().uuid(),
  amount: z.number().positive(),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  bankAccountId: z.string().uuid(),
  periodId: z.string().uuid(),
  reference: z.string().optional(),
});

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
export type ListSuppliersQuery = z.infer<typeof listSuppliersSchema>;
export type CreateSupplierInvoiceInput = z.infer<typeof createSupplierInvoiceSchema>;
export type ListSupplierInvoicesQuery = z.infer<typeof listSupplierInvoicesSchema>;
export type RecordSupplierPaymentInput = z.infer<typeof recordSupplierPaymentSchema>;
