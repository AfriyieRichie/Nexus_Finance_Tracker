import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendCreated, sendNoContent } from '../../utils/response';
import * as svc from './po.service';
import { createPoSchema, updatePoSchema, listPoSchema, convertToBillSchema, rejectPoSchema } from './po.schemas';

export const listPurchaseOrders = asyncHandler(async (req: Request, res: Response) => {
  const q = listPoSchema.parse(req.query);
  return sendSuccess(res, await svc.listPurchaseOrders(req.params.organisationId, q));
});

export const getPurchaseOrder = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await svc.getPurchaseOrder(req.params.organisationId, req.params.id));
});

export const createPurchaseOrder = asyncHandler(async (req: Request, res: Response) => {
  const input = createPoSchema.parse(req.body);
  return sendCreated(res, await svc.createPurchaseOrder(req.params.organisationId, req.user!.sub, input), 'Purchase order created');
});

export const updatePurchaseOrder = asyncHandler(async (req: Request, res: Response) => {
  const input = updatePoSchema.parse(req.body);
  return sendSuccess(res, await svc.updatePurchaseOrder(req.params.organisationId, req.params.id, input), 'Purchase order updated');
});

export const deletePurchaseOrder = asyncHandler(async (req: Request, res: Response) => {
  await svc.deletePurchaseOrder(req.params.organisationId, req.params.id);
  return sendNoContent(res);
});

export const submitForApproval = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await svc.submitForApproval(req.params.organisationId, req.params.id, req.user!.sub), 'Submitted for approval');
});

export const approvePurchaseOrder = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await svc.approvePurchaseOrder(req.params.organisationId, req.params.id, req.user!.sub), 'Purchase order approved');
});

export const rejectPurchaseOrder = asyncHandler(async (req: Request, res: Response) => {
  const { reason } = rejectPoSchema.parse(req.body);
  return sendSuccess(res, await svc.rejectPurchaseOrder(req.params.organisationId, req.params.id, req.user!.sub, reason), 'Purchase order rejected');
});

export const cancelPurchaseOrder = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await svc.cancelPurchaseOrder(req.params.organisationId, req.params.id, req.user!.sub), 'Purchase order cancelled');
});

export const convertToBill = asyncHandler(async (req: Request, res: Response) => {
  const input = convertToBillSchema.parse(req.body);
  return sendCreated(res, await svc.convertToBill(req.params.organisationId, req.params.id, req.user!.sub, input), 'Bill created from purchase order');
});
