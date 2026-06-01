import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import * as ctrl from './ap.controller';

const router = Router({ mergeParams: true });
router.use(requireAuth);

// ─── Suppliers ───────────────────────────────────────────────────────────────
router.get('/suppliers',                    requireRole(UserRole.REPORT_VIEWER),           ctrl.listSuppliers);
router.post('/suppliers',                   requireRole(UserRole.ACCOUNTS_PAYABLE_CLERK),  ctrl.createSupplier);
router.get('/suppliers/:supplierId',        requireRole(UserRole.REPORT_VIEWER),           ctrl.getSupplier);
router.put('/suppliers/:supplierId',        requireRole(UserRole.ACCOUNTS_PAYABLE_CLERK),  ctrl.updateSupplier);
router.delete('/suppliers/:supplierId',     requireRole(UserRole.ORG_ADMIN),               ctrl.deleteSupplier);

// ─── Supplier Invoices ───────────────────────────────────────────────────────
router.get('/invoices',                              requireRole(UserRole.REPORT_VIEWER),          ctrl.listSupplierInvoices);
router.post('/invoices',                             requireRole(UserRole.ACCOUNTS_PAYABLE_CLERK), ctrl.createSupplierInvoice);
router.get('/invoices/:invoiceId',                   requireRole(UserRole.REPORT_VIEWER),          ctrl.getSupplierInvoice);
router.post('/invoices/:invoiceId/submit-approval',  requireRole(UserRole.ACCOUNTS_PAYABLE_CLERK), ctrl.submitForApproval);
router.post('/invoices/:invoiceId/approve',          requireRole(UserRole.FINANCE_MANAGER),        ctrl.approveInvoice);
router.post('/invoices/:invoiceId/reject',           requireRole(UserRole.FINANCE_MANAGER),        ctrl.rejectInvoice);
router.post('/invoices/:invoiceId/void',             requireRole(UserRole.FINANCE_MANAGER),        ctrl.voidInvoice);
router.post('/invoices/:invoiceId/post',             requireRole(UserRole.FINANCE_MANAGER),        ctrl.postSupplierInvoice);

// Payments per invoice
router.get('/invoices/:invoiceId/payments',          requireRole(UserRole.REPORT_VIEWER),          ctrl.listSupplierPayments);

// ─── Payments ─────────────────────────────────────────────────────────────────
router.post('/payments',                             requireRole(UserRole.ACCOUNTS_PAYABLE_CLERK), ctrl.recordSupplierPayment);
router.post('/payments/:paymentId/reverse',          requireRole(UserRole.FINANCE_MANAGER),        ctrl.reversePayment);

// ─── Credit Notes ─────────────────────────────────────────────────────────────
router.get('/credit-notes',                          requireRole(UserRole.REPORT_VIEWER),          ctrl.listSupplierCreditNotes);
router.post('/credit-notes',                         requireRole(UserRole.ACCOUNTANT),             ctrl.createSupplierCreditNote);

// ─── Ageing ───────────────────────────────────────────────────────────────────
router.get('/ageing',                                requireRole(UserRole.REPORT_VIEWER),          ctrl.getApAgeing);

export { router as apRouter };
