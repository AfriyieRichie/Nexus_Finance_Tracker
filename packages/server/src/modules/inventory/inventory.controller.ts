import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  sendSuccess,
  sendCreated,
  sendNoContent,
  sendPaginated,
  buildPagination,
} from '../../utils/response';
import * as inventoryService from './inventory.service';

// ─── List items ───────────────────────────────────────────────────────────────

export const listItems = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const {
    search,
    category,
    isActive,
    page,
    pageSize,
  } = req.query as Record<string, string | undefined>;

  const { items, total, page: pg, pageSize: ps } = await inventoryService.listItems(
    organisationId,
    {
      search,
      category,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    },
  );

  return sendPaginated(res, items, buildPagination(pg, ps, total));
});

// ─── Valuation report ─────────────────────────────────────────────────────────
// Declared before getItem so the /valuation path is matched before /:itemId

export const getValuationReport = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const report = await inventoryService.getValuationReport(organisationId);
  return sendSuccess(res, report, 'Inventory valuation report');
});

// ─── Get single item ──────────────────────────────────────────────────────────

export const getItem = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, itemId } = req.params;
  const item = await inventoryService.getItem(organisationId, itemId);
  return sendSuccess(res, item);
});

// ─── Create item ──────────────────────────────────────────────────────────────

export const createItem = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const item = await inventoryService.createItem(organisationId, req.body);
  return sendCreated(res, item, 'Inventory item created');
});

// ─── Update item ──────────────────────────────────────────────────────────────

export const updateItem = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, itemId } = req.params;
  const item = await inventoryService.updateItem(organisationId, itemId, req.body);
  return sendSuccess(res, item, 'Inventory item updated');
});

// ─── Delete item ──────────────────────────────────────────────────────────────

export const deleteItem = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, itemId } = req.params;
  await inventoryService.deleteItem(organisationId, itemId);
  return sendNoContent(res);
});

// ─── Receive stock ────────────────────────────────────────────────────────────

export const receiveStock = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, itemId } = req.params;
  const { quantity, unitCost, notes } = req.body as {
    quantity: number;
    unitCost: number;
    notes?: string;
  };
  const item = await inventoryService.receiveStock(organisationId, {
    itemId,
    quantity: Number(quantity),
    unitCost: Number(unitCost),
    notes,
  });
  return sendSuccess(res, item, 'Stock received');
});

// ─── Issue stock ──────────────────────────────────────────────────────────────

export const issueStock = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, itemId } = req.params;
  const { quantity, notes } = req.body as { quantity: number; notes?: string };
  const item = await inventoryService.issueStock(organisationId, {
    itemId,
    quantity: Number(quantity),
    notes,
  });
  return sendSuccess(res, item, 'Stock issued');
});
