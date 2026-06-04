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
  whtRate: z.number().min(0).max(100).optional(),
  whtClassification: z.string().optional(),
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
  apAccountId: z.string().uuid().optional(),
  lines: z.array(supplierInvoiceLineSchema).min(1),
  skipDuplicateCheck: z.boolean().default(false),
});

export const listSupplierInvoicesSchema = z.object({
  supplierId: z.string().uuid().optional(),
  status: z.enum(['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
});

export const submitForApprovalSchema = z.object({
  comments: z.string().optional(),
});

export const approveInvoiceSchema = z.object({
  comments: z.string().optional(),
});

export const rejectInvoiceSchema = z.object({
  comments: z.string().min(1),
});

export const voidInvoiceSchema = z.object({
  reason: z.string().min(1),
});

export const recordSupplierPaymentSchema = z.object({
  supplierInvoiceId: z.string().uuid(),
  amount: z.number().positive(),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  bankAccountId: z.string().uuid(),
  periodId: z.string().uuid(),
  reference: z.string().optional(),
  applyWht: z.boolean().default(true),
});

export const reversePaymentSchema = z.object({
  reason: z.string().min(1),
  periodId: z.string().uuid(),
});

export const createSupplierCreditNoteSchema = z.object({
  supplierId: z.string().uuid(),
  supplierInvoiceId: z.string().uuid().optional(),
  creditNoteNumber: z.string().min(1).max(50),
  creditNoteDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().positive(),
  taxAmount: z.number().nonnegative().default(0),
  reason: z.string().optional(),
  currency: z.string().length(3).default('GHS'),
  exchangeRate: z.number().positive().default(1),
  periodId: z.string().uuid(),
  accountId: z.string().uuid().optional(),
});

export const listSupplierCreditNotesSchema = z.object({
  supplierId: z.string().uuid().optional(),
});

export const statementQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const emailStatementSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  toEmail: z.string().email().optional(),
});

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
export type ListSuppliersQuery = z.infer<typeof listSuppliersSchema>;
export type CreateSupplierInvoiceInput = z.infer<typeof createSupplierInvoiceSchema>;
export type ListSupplierInvoicesQuery = z.infer<typeof listSupplierInvoicesSchema>;
export type SubmitForApprovalInput = z.infer<typeof submitForApprovalSchema>;
export type ApproveInvoiceInput = z.infer<typeof approveInvoiceSchema>;
export type RejectInvoiceInput = z.infer<typeof rejectInvoiceSchema>;
export type VoidInvoiceInput = z.infer<typeof voidInvoiceSchema>;
export type RecordSupplierPaymentInput = z.infer<typeof recordSupplierPaymentSchema>;
export type ReversePaymentInput = z.infer<typeof reversePaymentSchema>;
export type CreateSupplierCreditNoteInput = z.infer<typeof createSupplierCreditNoteSchema>;
export type ListSupplierCreditNotesQuery = z.infer<typeof listSupplierCreditNotesSchema>;
export type StatementQuery = z.infer<typeof statementQuerySchema>;
export type EmailStatementInput = z.infer<typeof emailStatementSchema>;
