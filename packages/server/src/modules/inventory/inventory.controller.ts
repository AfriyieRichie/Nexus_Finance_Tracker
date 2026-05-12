import { Request, Response } from 'express';
import { MovementType } from '@prisma/client';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  sendSuccess,
  sendCreated,
  sendNoContent,
  sendPaginated,
  buildPagination,
} from '../../utils/response';
import * as inventoryService from './inventory.service';

// ─── Categories ───────────────────────────────────────────────────────────────

export const listCategories = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const categories = await inventoryService.listCategories(organisationId);
  return sendSuccess(res, categories);
});

export const createCategory = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const category = await inventoryService.createCategory(organisationId, req.body);
  return sendCreated(res, category, 'Category created');
});

export const updateCategory = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, categoryId } = req.params;
  const category = await inventoryService.updateCategory(organisationId, categoryId, req.body);
  return sendSuccess(res, category, 'Category updated');
});

// ─── Locations ────────────────────────────────────────────────────────────────

export const listLocations = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const locations = await inventoryService.listLocations(organisationId);
  return sendSuccess(res, locations);
});

export const createLocation = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const location = await inventoryService.createLocation(organisationId, req.body);
  return sendCreated(res, location, 'Location created');
});

export const updateLocation = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, locationId } = req.params;
  const location = await inventoryService.updateLocation(organisationId, locationId, req.body);
  return sendSuccess(res, location, 'Location updated');
});

// ─── Items ────────────────────────────────────────────────────────────────────

export const listItems = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const {
    search,
    categoryId,
    isActive,
    isLowStock,
    page,
    pageSize,
  } = req.query as Record<string, string | undefined>;

  const { items, total, page: pg, pageSize: ps } = await inventoryService.listItems(
    organisationId,
    {
      search,
      categoryId,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      isLowStock: isLowStock === 'true',
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    },
  );

  return sendPaginated(res, items, buildPagination(pg, ps, total));
});

export const getItem = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, itemId } = req.params;
  const item = await inventoryService.getItem(organisationId, itemId);
  return sendSuccess(res, item);
});

export const createItem = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const item = await inventoryService.createItem(organisationId, req.body);
  return sendCreated(res, item, 'Inventory item created');
});

export const updateItem = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, itemId } = req.params;
  const item = await inventoryService.updateItem(organisationId, itemId, req.body);
  return sendSuccess(res, item, 'Inventory item updated');
});

export const deleteItem = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, itemId } = req.params;
  await inventoryService.deleteItem(organisationId, itemId);
  return sendNoContent(res);
});

// ─── Movements ────────────────────────────────────────────────────────────────

export const listMovements = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const { itemId, movementType, status, page, pageSize } =
    req.query as Record<string, string | undefined>;

  const { movements, total, page: pg, pageSize: ps } = await inventoryService.listMovements(
    organisationId,
    {
      itemId,
      movementType: movementType as MovementType | undefined,
      status: status as inventoryService.ListMovementsParams['status'],
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    },
  );

  return sendPaginated(res, movements, buildPagination(pg, ps, total));
});

export const createMovement = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const movement = await inventoryService.createMovement(organisationId, req.user!.sub, req.body);
  return sendCreated(res, movement, 'Movement created');
});

export const approveMovement = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, movementId } = req.params;
  const movement = await inventoryService.approveMovement(organisationId, movementId, req.user!.sub);
  return sendSuccess(res, movement, 'Movement approved');
});

export const rejectMovement = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, movementId } = req.params;
  const movement = await inventoryService.rejectMovement(organisationId, movementId, req.user!.sub);
  return sendSuccess(res, movement, 'Movement rejected');
});

export const repostMovementGL = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, movementId } = req.params;
  const { contraAccountId, periodId } = req.body as { contraAccountId: string; periodId: string };
  const result = await inventoryService.repostMovementGL(organisationId, movementId, req.user!.sub, { contraAccountId, periodId });
  return sendCreated(res, result, 'GL journal posted for movement');
});

// ─── Stocktake ────────────────────────────────────────────────────────────────

export const listStocktakeSessions = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const sessions = await inventoryService.listStocktakeSessions(organisationId);
  return sendSuccess(res, sessions);
});

export const createStocktakeSession = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const session = await inventoryService.createStocktakeSession(organisationId, req.user!.sub, req.body);
  return sendCreated(res, session, 'Stocktake session created');
});

export const getStocktakeSession = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, sessionId } = req.params;
  const session = await inventoryService.getStocktakeSession(organisationId, sessionId);
  return sendSuccess(res, session);
});

export const updateStocktakeCount = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, sessionId, itemId } = req.params;
  const { countedQuantity, notes } = req.body as { countedQuantity: number; notes?: string };
  const count = await inventoryService.updateStocktakeCount(
    organisationId,
    sessionId,
    itemId,
    Number(countedQuantity),
    notes,
  );
  return sendSuccess(res, count, 'Count updated');
});

export const postStocktakeVariances = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, sessionId } = req.params;
  const { periodId } = req.body as { periodId: string };
  const session = await inventoryService.postStocktakeVariances(
    organisationId,
    sessionId,
    req.user!.sub,
    periodId,
  );
  return sendSuccess(res, session, 'Stocktake variances posted');
});

export const cancelStocktakeSession = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, sessionId } = req.params;
  const session = await inventoryService.cancelStocktakeSession(organisationId, sessionId);
  return sendSuccess(res, session, 'Stocktake session cancelled');
});

// ─── Valuation ────────────────────────────────────────────────────────────────
// Declared before getItem so the /valuation path is matched before /:itemId

export const getValuationReport = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const { asAt } = req.query as { asAt?: string };
  const report = await inventoryService.getValuationReport(organisationId, asAt);
  return sendSuccess(res, report, 'Inventory valuation report');
});

export const getStockBalance = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, itemId } = req.params;
  const balance = await inventoryService.getStockBalance(organisationId, itemId);
  return sendSuccess(res, balance);
});

// ─── Legacy compatibility shims ───────────────────────────────────────────────
// receiveStock and issueStock are now routed through createMovement.
// These exports are kept so any existing route registration that already
// wires up the old names does not break at the JS level.

export const receiveStock = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, itemId } = req.params;
  const { quantity, unitCost, periodId, contraAccountId, reference } = req.body as {
    quantity: number;
    unitCost: number;
    periodId?: string;
    contraAccountId?: string;
    reference?: string;
  };
  const movement = await inventoryService.createMovement(organisationId, req.user!.sub, {
    itemId,
    movementType: MovementType.RECEIPT,
    quantity: Number(quantity),
    unitCost: Number(unitCost),
    periodId,
    contraAccountId,
    reference,
    transactionDate: new Date().toISOString().slice(0, 10),
  });
  return sendSuccess(res, movement, 'Stock received');
});

export const issueStock = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, itemId } = req.params;
  const { quantity, periodId, contraAccountId, reference } = req.body as {
    quantity: number;
    periodId?: string;
    contraAccountId?: string;
    reference?: string;
  };
  const movement = await inventoryService.createMovement(organisationId, req.user!.sub, {
    itemId,
    movementType: MovementType.ISSUE,
    quantity: Number(quantity),
    periodId,
    contraAccountId,
    reference,
    transactionDate: new Date().toISOString().slice(0, 10),
  });
  return sendSuccess(res, movement, 'Stock issued');
});
