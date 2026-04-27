import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendCreated, sendPaginated, buildPagination } from '../../utils/response';
import {
  createCustomerSchema, updateCustomerSchema, listCustomersSchema,
  createInvoiceSchema, listInvoicesSchema, recordPaymentSchema,
  createCreditNoteSchema, writeBadDebtSchema,
} from './ar.schemas';
import * as arService from './ar.service';

// ─── Customers ───────────────────────────────────────────────────────────────

export const createCustomer = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const input = createCustomerSchema.parse(req.body);
  const customer = await arService.createCustomer(organisationId, input);
  return sendCreated(res, customer, 'Customer created');
});

export const updateCustomer = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, customerId } = req.params;
  const input = updateCustomerSchema.parse(req.body);
  const customer = await arService.updateCustomer(organisationId, customerId, input);
  return sendSuccess(res, customer, 'Customer updated');
});

export const listCustomers = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const query = listCustomersSchema.parse(req.query);
  const { customers, total, page, pageSize } = await arService.listCustomers(organisationId, query);
  return sendPaginated(res, customers, buildPagination(page, pageSize, total));
});

export const getCustomer = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, customerId } = req.params;
  const customer = await arService.getCustomer(organisationId, customerId);
  return sendSuccess(res, customer);
});

export const deleteCustomer = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, customerId } = req.params;
  await arService.deleteCustomer(organisationId, customerId);
  return sendSuccess(res, null, 'Customer deleted');
});

// ─── Invoices ────────────────────────────────────────────────────────────────

export const createInvoice = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const userId = req.user!.sub;
  const input = createInvoiceSchema.parse(req.body);
  const invoice = await arService.createInvoice(organisationId, userId, input);
  return sendCreated(res, invoice, 'Invoice created');
});

export const listInvoices = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const query = listInvoicesSchema.parse(req.query);
  const { invoices, total, page, pageSize } = await arService.listInvoices(organisationId, query);
  return sendPaginated(res, invoices, buildPagination(page, pageSize, total));
});

export const getInvoice = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, invoiceId } = req.params;
  const invoice = await arService.getInvoice(organisationId, invoiceId);
  return sendSuccess(res, invoice);
});

export const postInvoice = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, invoiceId } = req.params;
  const { periodId } = req.body;
  const userId = req.user!.sub;
  const result = await arService.postInvoice(organisationId, invoiceId, periodId, userId);
  return sendSuccess(res, result, 'Invoice posted to ledger');
});

export const recordPayment = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const userId = req.user!.sub;
  const input = recordPaymentSchema.parse(req.body);
  const result = await arService.recordPayment(organisationId, userId, input);
  return sendSuccess(res, result, 'Payment recorded');
});

export const getArAgeing = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const ageing = await arService.getArAgeing(organisationId);
  return sendSuccess(res, ageing);
});

export const createCreditNote = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const userId = req.user!.sub;
  const input = createCreditNoteSchema.parse(req.body);
  const result = await arService.createCreditNote(organisationId, userId, input);
  return sendCreated(res, result, 'Credit note issued');
});

export const writeBadDebt = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const userId = req.user!.sub;
  const input = writeBadDebtSchema.parse(req.body);
  const result = await arService.writeBadDebt(organisationId, userId, input);
  return sendSuccess(res, result, 'Bad debt written off');
});
