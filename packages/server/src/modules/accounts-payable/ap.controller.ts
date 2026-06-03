import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendCreated, sendPaginated, buildPagination } from '../../utils/response';
import {
  createSupplierSchema, updateSupplierSchema, listSuppliersSchema,
  createSupplierInvoiceSchema, listSupplierInvoicesSchema,
  submitForApprovalSchema, approveInvoiceSchema, rejectInvoiceSchema, voidInvoiceSchema,
  recordSupplierPaymentSchema, reversePaymentSchema,
  createSupplierCreditNoteSchema, listSupplierCreditNotesSchema,
  statementQuerySchema, emailStatementSchema,
} from './ap.schemas';
import * as apService from './ap.service';

// ─── Suppliers ───────────────────────────────────────────────────────────────

export const createSupplier = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const input = createSupplierSchema.parse(req.body);
  return sendCreated(res, await apService.createSupplier(organisationId, input), 'Supplier created');
});

export const updateSupplier = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, supplierId } = req.params;
  const input = updateSupplierSchema.parse(req.body);
  return sendSuccess(res, await apService.updateSupplier(organisationId, supplierId, input), 'Supplier updated');
});

export const listSuppliers = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const query = listSuppliersSchema.parse(req.query);
  const { suppliers, total, page, pageSize } = await apService.listSuppliers(organisationId, query);
  return sendPaginated(res, suppliers, buildPagination(page, pageSize, total));
});

export const getSupplier = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, supplierId } = req.params;
  return sendSuccess(res, await apService.getSupplier(organisationId, supplierId));
});

export const getSupplierStatement = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, supplierId } = req.params;
  const query = statementQuerySchema.parse(req.query);
  return sendSuccess(res, await apService.generateSupplierStatement(organisationId, supplierId, query));
});

export const emailSupplierStatement = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, supplierId } = req.params;
  const input = emailStatementSchema.parse(req.body);
  const result = await apService.emailSupplierStatement(organisationId, supplierId, input);
  return sendSuccess(res, result, `Statement emailed to ${result.sentTo}`);
});

export const deleteSupplier = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, supplierId } = req.params;
  await apService.deleteSupplier(organisationId, supplierId);
  return sendSuccess(res, null, 'Supplier deleted');
});

// ─── Supplier Invoices ───────────────────────────────────────────────────────

export const createSupplierInvoice = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const input = createSupplierInvoiceSchema.parse(req.body);
  return sendCreated(res, await apService.createSupplierInvoice(organisationId, req.user!.sub, input), 'Supplier invoice created');
});

export const listSupplierInvoices = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const query = listSupplierInvoicesSchema.parse(req.query);
  const { invoices, total, page, pageSize } = await apService.listSupplierInvoices(organisationId, query);
  return sendPaginated(res, invoices, buildPagination(page, pageSize, total));
});

export const getSupplierInvoice = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, invoiceId } = req.params;
  return sendSuccess(res, await apService.getSupplierInvoice(organisationId, invoiceId));
});

export const submitForApproval = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, invoiceId } = req.params;
  const input = submitForApprovalSchema.parse(req.body);
  return sendSuccess(res, await apService.submitSupplierInvoiceForApproval(organisationId, invoiceId, req.user!.sub, input.comments), 'Invoice submitted for approval');
});

export const approveInvoice = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, invoiceId } = req.params;
  const input = approveInvoiceSchema.parse(req.body);
  return sendSuccess(res, await apService.approveSupplierInvoice(organisationId, invoiceId, req.user!.sub, input.comments), 'Invoice approved');
});

export const rejectInvoice = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, invoiceId } = req.params;
  const input = rejectInvoiceSchema.parse(req.body);
  return sendSuccess(res, await apService.rejectSupplierInvoice(organisationId, invoiceId, req.user!.sub, input.comments), 'Invoice rejected');
});

export const voidInvoice = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, invoiceId } = req.params;
  const input = voidInvoiceSchema.parse(req.body);
  return sendSuccess(res, await apService.voidSupplierInvoice(organisationId, invoiceId, req.user!.sub, input.reason), 'Invoice voided');
});

export const postSupplierInvoice = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, invoiceId } = req.params;
  const { periodId } = req.body;
  return sendSuccess(res, await apService.postSupplierInvoice(organisationId, invoiceId, periodId, req.user!.sub), 'Invoice posted');
});

// ─── Payments ─────────────────────────────────────────────────────────────────

export const recordSupplierPayment = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const input = recordSupplierPaymentSchema.parse(req.body);
  return sendSuccess(res, await apService.recordSupplierPayment(organisationId, req.user!.sub, input), 'Payment recorded');
});

export const listSupplierPayments = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, invoiceId } = req.params;
  return sendSuccess(res, await apService.listSupplierPayments(organisationId, invoiceId));
});

export const reversePayment = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, paymentId } = req.params;
  const input = reversePaymentSchema.parse(req.body);
  return sendSuccess(res, await apService.reverseSupplierPayment(organisationId, paymentId, req.user!.sub, input), 'Payment reversed');
});

// ─── Credit Notes ─────────────────────────────────────────────────────────────

export const createSupplierCreditNote = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const input = createSupplierCreditNoteSchema.parse(req.body);
  return sendCreated(res, await apService.createSupplierCreditNote(organisationId, req.user!.sub, input), 'Credit note created');
});

export const listSupplierCreditNotes = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const query = listSupplierCreditNotesSchema.parse(req.query);
  return sendSuccess(res, await apService.listSupplierCreditNotes(organisationId, query));
});

// ─── Ageing ───────────────────────────────────────────────────────────────────

export const getApAgeing = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  return sendSuccess(res, await apService.getApAgeing(organisationId));
});
