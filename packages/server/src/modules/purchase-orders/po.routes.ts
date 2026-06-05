import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import * as ctrl from './po.controller';

export const purchaseOrdersRouter = Router({ mergeParams: true });
purchaseOrdersRouter.use(requireAuth);

purchaseOrdersRouter.get('/',                requireRole(UserRole.REPORT_VIEWER),          ctrl.listPurchaseOrders);
purchaseOrdersRouter.post('/',               requireRole(UserRole.ACCOUNTS_PAYABLE_CLERK), ctrl.createPurchaseOrder);
purchaseOrdersRouter.get('/:id',             requireRole(UserRole.REPORT_VIEWER),          ctrl.getPurchaseOrder);
purchaseOrdersRouter.put('/:id',             requireRole(UserRole.ACCOUNTS_PAYABLE_CLERK), ctrl.updatePurchaseOrder);
purchaseOrdersRouter.delete('/:id',          requireRole(UserRole.FINANCE_MANAGER),        ctrl.deletePurchaseOrder);
purchaseOrdersRouter.post('/:id/submit',     requireRole(UserRole.ACCOUNTS_PAYABLE_CLERK), ctrl.submitForApproval);
purchaseOrdersRouter.post('/:id/approve',    requireRole(UserRole.FINANCE_MANAGER),        ctrl.approvePurchaseOrder);
purchaseOrdersRouter.post('/:id/reject',     requireRole(UserRole.FINANCE_MANAGER),        ctrl.rejectPurchaseOrder);
purchaseOrdersRouter.post('/:id/cancel',     requireRole(UserRole.FINANCE_MANAGER),        ctrl.cancelPurchaseOrder);
purchaseOrdersRouter.post('/:id/convert-to-bill', requireRole(UserRole.ACCOUNTS_PAYABLE_CLERK), ctrl.convertToBill);
