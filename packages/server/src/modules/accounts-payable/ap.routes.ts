import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import * as ctrl from './ap.controller';

const router = Router({ mergeParams: true });
router.use(requireAuth);

router.get('/suppliers', ctrl.listSuppliers);
router.post('/suppliers', ctrl.createSupplier);
router.get('/suppliers/:supplierId', ctrl.getSupplier);
router.put('/suppliers/:supplierId', ctrl.updateSupplier);
router.delete('/suppliers/:supplierId', ctrl.deleteSupplier);

router.get('/invoices', ctrl.listSupplierInvoices);
router.post('/invoices', ctrl.createSupplierInvoice);
router.get('/invoices/:invoiceId', ctrl.getSupplierInvoice);
router.post('/invoices/:invoiceId/post', ctrl.postSupplierInvoice);

router.post('/payments', ctrl.recordSupplierPayment);
router.get('/ageing', ctrl.getApAgeing);

export { router as apRouter };
