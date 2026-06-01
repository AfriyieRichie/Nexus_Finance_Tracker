import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import * as ctrl from './inventory.controller';

// Mounted at /api/v1/organisations/:organisationId/inventory
export const inventoryRouter = Router({ mergeParams: true });
inventoryRouter.use(requireAuth);

// ── Categories ────────────────────────────────────────────────────────────────
inventoryRouter.get('/categories', requireRole(UserRole.REPORT_VIEWER), ctrl.listCategories);
inventoryRouter.post('/categories', requireRole(UserRole.FINANCE_MANAGER), ctrl.createCategory);
inventoryRouter.patch('/categories/:categoryId', requireRole(UserRole.FINANCE_MANAGER), ctrl.updateCategory);

// ── Locations ─────────────────────────────────────────────────────────────────
inventoryRouter.get('/locations', requireRole(UserRole.REPORT_VIEWER), ctrl.listLocations);
inventoryRouter.post('/locations', requireRole(UserRole.FINANCE_MANAGER), ctrl.createLocation);
inventoryRouter.patch('/locations/:locationId', requireRole(UserRole.FINANCE_MANAGER), ctrl.updateLocation);

// ── Movements ─────────────────────────────────────────────────────────────────
inventoryRouter.get('/movements', requireRole(UserRole.REPORT_VIEWER), ctrl.listMovements);
inventoryRouter.post('/movements', requireRole(UserRole.ACCOUNTANT), ctrl.createMovement);
inventoryRouter.post('/movements/:movementId/approve', requireRole(UserRole.FINANCE_MANAGER), ctrl.approveMovement);
inventoryRouter.post('/movements/:movementId/reject', requireRole(UserRole.FINANCE_MANAGER), ctrl.rejectMovement);
inventoryRouter.post('/movements/:movementId/repost-gl', requireRole(UserRole.FINANCE_MANAGER), ctrl.repostMovementGL);

// ── Stocktake ─────────────────────────────────────────────────────────────────
inventoryRouter.get('/stocktake', requireRole(UserRole.REPORT_VIEWER), ctrl.listStocktakeSessions);
inventoryRouter.post('/stocktake', requireRole(UserRole.FINANCE_MANAGER), ctrl.createStocktakeSession);
inventoryRouter.get('/stocktake/:sessionId', requireRole(UserRole.REPORT_VIEWER), ctrl.getStocktakeSession);
inventoryRouter.patch('/stocktake/:sessionId/counts/:itemId', requireRole(UserRole.ACCOUNTANT), ctrl.updateStocktakeCount);
inventoryRouter.post('/stocktake/:sessionId/post', requireRole(UserRole.FINANCE_MANAGER), ctrl.postStocktakeVariances);
inventoryRouter.post('/stocktake/:sessionId/cancel', requireRole(UserRole.FINANCE_MANAGER), ctrl.cancelStocktakeSession);

// ── Items — valuation & balance before /:itemId to avoid route collision ──────
inventoryRouter.get('/valuation', requireRole(UserRole.REPORT_VIEWER), ctrl.getValuationReport);

inventoryRouter.get('/', requireRole(UserRole.REPORT_VIEWER), ctrl.listItems);
inventoryRouter.post('/', requireRole(UserRole.FINANCE_MANAGER), ctrl.createItem);

inventoryRouter.get('/:itemId', requireRole(UserRole.REPORT_VIEWER), ctrl.getItem);
inventoryRouter.get('/:itemId/balance', requireRole(UserRole.REPORT_VIEWER), ctrl.getStockBalance);
inventoryRouter.patch('/:itemId', requireRole(UserRole.FINANCE_MANAGER), ctrl.updateItem);
inventoryRouter.delete('/:itemId', requireRole(UserRole.FINANCE_MANAGER), ctrl.deleteItem);
inventoryRouter.post('/:itemId/nrv-writedown', requireRole(UserRole.FINANCE_MANAGER), ctrl.nrvWriteDown);

// ── Legacy shims ──────────────────────────────────────────────────────────────
inventoryRouter.post('/:itemId/receive', requireRole(UserRole.ACCOUNTANT), ctrl.receiveStock);
inventoryRouter.post('/:itemId/issue', requireRole(UserRole.ACCOUNTANT), ctrl.issueStock);
