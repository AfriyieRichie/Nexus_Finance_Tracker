import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendCreated } from '../../utils/response';
import * as svc from './pv.service';
import { createPvSchema, listPvSchema, payPvSchema, rejectPvSchema } from './pv.schemas';

export const listPaymentVouchers = asyncHandler(async (req: Request, res: Response) => {
  const q = listPvSchema.parse(req.query);
  return sendSuccess(res, await svc.listPaymentVouchers(req.params.organisationId, q));
});

export const getPaymentVoucher = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await svc.getPaymentVoucher(req.params.organisationId, req.params.id));
});

export const createPaymentVoucher = asyncHandler(async (req: Request, res: Response) => {
  const input = createPvSchema.parse(req.body);
  return sendCreated(res, await svc.createPaymentVoucher(req.params.organisationId, req.user!.sub, input), 'Payment voucher raised');
});

export const submitForApproval = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await svc.submitForApproval(req.params.organisationId, req.params.id, req.user!.sub), 'Submitted for approval');
});

export const approvePaymentVoucher = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await svc.approvePaymentVoucher(req.params.organisationId, req.params.id, req.user!.sub), 'Payment voucher approved');
});

export const rejectPaymentVoucher = asyncHandler(async (req: Request, res: Response) => {
  const { reason } = rejectPvSchema.parse(req.body);
  return sendSuccess(res, await svc.rejectPaymentVoucher(req.params.organisationId, req.params.id, req.user!.sub, reason), 'Payment voucher rejected');
});

export const cancelPaymentVoucher = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await svc.cancelPaymentVoucher(req.params.organisationId, req.params.id, req.user!.sub), 'Payment voucher cancelled');
});

export const payPaymentVoucher = asyncHandler(async (req: Request, res: Response) => {
  const input = payPvSchema.parse(req.body);
  return sendSuccess(res, await svc.payPaymentVoucher(req.params.organisationId, req.params.id, req.user!.sub, input), 'Payment voucher paid');
});
