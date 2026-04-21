import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendCreated, sendPaginated, buildPagination } from '../../utils/response';
import {
  createSupplierSchema, updateSupplierSchema, listSuppliersSchema,
  createSupplierInvoiceSchema, listSupplierInvoicesSchema, recordSupplierPaymentSchema,
} from './ap.schemas';
import * as apService from './ap.service';

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

export const deleteSupplier = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, supplierId } = req.params;
  await apService.deleteSupplier(organisationId, supplierId);
  return sendSuccess(res, null, 'Supplier deleted');
});

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

export const postSupplierInvoice = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, invoiceId } = req.params;
  const { periodId } = req.body;
  return sendSuccess(res, await apService.postSupplierInvoice(organisationId, invoiceId, periodId, req.user!.sub), 'Invoice posted');
});

export const recordSupplierPayment = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const input = recordSupplierPaymentSchema.parse(req.body);
  return sendSuccess(res, await apService.recordSupplierPayment(organisationId, req.user!.sub, input), 'Payment recorded');
});

export const getApAgeing = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  return sendSuccess(res, await apService.getApAgeing(organisationId));
});
