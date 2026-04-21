import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import * as ctrl from './ar.controller';

const router = Router({ mergeParams: true });
router.use(requireAuth);

// Customers
router.get('/customers', ctrl.listCustomers);
router.post('/customers', ctrl.createCustomer);
router.get('/customers/:customerId', ctrl.getCustomer);
router.put('/customers/:customerId', ctrl.updateCustomer);
router.delete('/customers/:customerId', ctrl.deleteCustomer);

// Invoices
router.get('/invoices', ctrl.listInvoices);
router.post('/invoices', ctrl.createInvoice);
router.get('/invoices/:invoiceId', ctrl.getInvoice);
router.post('/invoices/:invoiceId/post', ctrl.postInvoice);

// Payments & Ageing
router.post('/payments', ctrl.recordPayment);
router.get('/ageing', ctrl.getArAgeing);

export { router as arRouter };
