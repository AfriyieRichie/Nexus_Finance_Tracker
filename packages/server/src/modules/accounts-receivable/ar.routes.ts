import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import * as ctrl from './ar.controller';

const router = Router({ mergeParams: true });
router.use(requireAuth);

// Customers
router.get('/customers', requireRole(UserRole.REPORT_VIEWER), ctrl.listCustomers);
router.post('/customers', requireRole(UserRole.ACCOUNTS_RECEIVABLE_CLERK), ctrl.createCustomer);
router.get('/customers/:customerId', requireRole(UserRole.REPORT_VIEWER), ctrl.getCustomer);
router.put('/customers/:customerId', requireRole(UserRole.ACCOUNTS_RECEIVABLE_CLERK), ctrl.updateCustomer);
router.delete('/customers/:customerId', requireRole(UserRole.ORG_ADMIN), ctrl.deleteCustomer);

// Invoices
router.get('/invoices', requireRole(UserRole.REPORT_VIEWER), ctrl.listInvoices);
router.post('/invoices', requireRole(UserRole.ACCOUNTS_RECEIVABLE_CLERK), ctrl.createInvoice);
router.get('/invoices/:invoiceId', requireRole(UserRole.REPORT_VIEWER), ctrl.getInvoice);
router.post('/invoices/:invoiceId/submit', requireRole(UserRole.ACCOUNTS_RECEIVABLE_CLERK), ctrl.submitInvoiceForApproval);
router.post('/invoices/:invoiceId/approve', requireRole(UserRole.APPROVER), ctrl.approveInvoice);
router.post('/invoices/:invoiceId/reject', requireRole(UserRole.APPROVER), ctrl.rejectInvoice);
router.post('/invoices/:invoiceId/post', requireRole(UserRole.FINANCE_MANAGER), ctrl.postInvoice);

// Payments, Credit Notes, Bad Debt & Ageing
router.post('/payments', requireRole(UserRole.ACCOUNTS_RECEIVABLE_CLERK), ctrl.recordPayment);
router.post('/credit-notes', requireRole(UserRole.ACCOUNTS_RECEIVABLE_CLERK), ctrl.createCreditNote);
router.post('/write-offs', requireRole(UserRole.FINANCE_MANAGER), ctrl.writeBadDebt);
router.get('/ageing', requireRole(UserRole.REPORT_VIEWER), ctrl.getArAgeing);

// Customer Statements
router.get('/customers/:customerId/statement', requireRole(UserRole.REPORT_VIEWER), ctrl.getCustomerStatement);
router.post('/customers/:customerId/statement/email', requireRole(UserRole.ACCOUNTS_RECEIVABLE_CLERK), ctrl.emailCustomerStatement);

export { router as arRouter };
