import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import * as inventoryController from './inventory.controller';

// Mounted at /api/v1/organisations/:organisationId/inventory
export const inventoryRouter = Router({ mergeParams: true });

inventoryRouter.use(requireAuth);

// Valuation report — must be registered before /:itemId to avoid route collision
inventoryRouter.get(
  '/valuation',
  requireRole(UserRole.REPORT_VIEWER),
  inventoryController.getValuationReport,
);

// List & create
inventoryRouter.get('/', requireRole(UserRole.REPORT_VIEWER), inventoryController.listItems);
inventoryRouter.post('/', requireRole(UserRole.FINANCE_MANAGER), inventoryController.createItem);

// Single item CRUD
inventoryRouter.get('/:itemId', requireRole(UserRole.REPORT_VIEWER), inventoryController.getItem);
inventoryRouter.patch(
  '/:itemId',
  requireRole(UserRole.FINANCE_MANAGER),
  inventoryController.updateItem,
);
inventoryRouter.delete(
  '/:itemId',
  requireRole(UserRole.FINANCE_MANAGER),
  inventoryController.deleteItem,
);

// Stock movements
inventoryRouter.post(
  '/:itemId/receive',
  requireRole(UserRole.ACCOUNTANT),
  inventoryController.receiveStock,
);
inventoryRouter.post(
  '/:itemId/issue',
  requireRole(UserRole.ACCOUNTANT),
  inventoryController.issueStock,
);
