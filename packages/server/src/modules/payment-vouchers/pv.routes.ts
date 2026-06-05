import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import * as ctrl from './pv.controller';

export const paymentVouchersRouter = Router({ mergeParams: true });
paymentVouchersRouter.use(requireAuth);

paymentVouchersRouter.get('/',             requireRole(UserRole.REPORT_VIEWER),          ctrl.listPaymentVouchers);
paymentVouchersRouter.post('/',            requireRole(UserRole.ACCOUNTS_PAYABLE_CLERK), ctrl.createPaymentVoucher);
paymentVouchersRouter.get('/:id',          requireRole(UserRole.REPORT_VIEWER),          ctrl.getPaymentVoucher);
paymentVouchersRouter.post('/:id/submit',  requireRole(UserRole.ACCOUNTS_PAYABLE_CLERK), ctrl.submitForApproval);
paymentVouchersRouter.post('/:id/approve', requireRole(UserRole.FINANCE_MANAGER),        ctrl.approvePaymentVoucher);
paymentVouchersRouter.post('/:id/reject',  requireRole(UserRole.FINANCE_MANAGER),        ctrl.rejectPaymentVoucher);
paymentVouchersRouter.post('/:id/cancel',  requireRole(UserRole.FINANCE_MANAGER),        ctrl.cancelPaymentVoucher);
paymentVouchersRouter.post('/:id/pay',     requireRole(UserRole.FINANCE_MANAGER),        ctrl.payPaymentVoucher);
