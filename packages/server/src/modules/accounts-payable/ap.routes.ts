import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import * as ctrl from './ap.controller';

const router = Router({ mergeParams: true });
router.use(requireAuth);

router.get('/suppliers', requireRole(UserRole.REPORT_VIEWER), ctrl.listSuppliers);
router.post('/suppliers', requireRole(UserRole.ACCOUNTS_PAYABLE_CLERK), ctrl.createSupplier);
router.get('/suppliers/:supplierId', requireRole(UserRole.REPORT_VIEWER), ctrl.getSupplier);
router.put('/suppliers/:supplierId', requireRole(UserRole.ACCOUNTS_PAYABLE_CLERK), ctrl.updateSupplier);
router.delete('/suppliers/:supplierId', requireRole(UserRole.ORG_ADMIN), ctrl.deleteSupplier);

router.get('/invoices', requireRole(UserRole.REPORT_VIEWER), ctrl.listSupplierInvoices);
router.post('/invoices', requireRole(UserRole.ACCOUNTS_PAYABLE_CLERK), ctrl.createSupplierInvoice);
router.get('/invoices/:invoiceId', requireRole(UserRole.REPORT_VIEWER), ctrl.getSupplierInvoice);
router.post('/invoices/:invoiceId/post', requireRole(UserRole.FINANCE_MANAGER), ctrl.postSupplierInvoice);

router.post('/payments', requireRole(UserRole.ACCOUNTS_PAYABLE_CLERK), ctrl.recordSupplierPayment);
router.get('/ageing', requireRole(UserRole.REPORT_VIEWER), ctrl.getApAgeing);

export { router as apRouter };
