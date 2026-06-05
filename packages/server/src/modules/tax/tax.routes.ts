import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import * as ctrl from './tax.controller';

// Mounted at /api/v1/organisations/:organisationId/tax
export const taxRouter = Router({ mergeParams: true });
taxRouter.use(requireAuth);

// ─── Exchange Rates (static prefix before /:id) ───────────────────────────────

taxRouter.get('/exchange-rates/latest', requireRole(UserRole.REPORT_VIEWER), ctrl.getLatestRate);
taxRouter.get('/exchange-rates', requireRole(UserRole.REPORT_VIEWER), ctrl.listExchangeRates);
taxRouter.post('/exchange-rates', requireRole(UserRole.ACCOUNTANT), ctrl.upsertExchangeRate);

// ─── Tax Centre (liability report) ────────────────────────────────────────────

taxRouter.get('/tax-summary', requireRole(UserRole.REPORT_VIEWER), ctrl.getTaxSummary);
taxRouter.get('/tax-transactions', requireRole(UserRole.REPORT_VIEWER), ctrl.getTaxTransactions);

// ─── VAT Returns ──────────────────────────────────────────────────────────────

taxRouter.get('/vat-returns', requireRole(UserRole.REPORT_VIEWER), ctrl.listVatReturns);
taxRouter.post('/vat-returns', requireRole(UserRole.FINANCE_MANAGER), ctrl.generateVatReturn);
taxRouter.get('/vat-returns/:id', requireRole(UserRole.REPORT_VIEWER), ctrl.getVatReturn);
taxRouter.patch('/vat-returns/:id/status', requireRole(UserRole.FINANCE_MANAGER), ctrl.updateVatReturnStatus);
taxRouter.delete('/vat-returns/:id', requireRole(UserRole.FINANCE_MANAGER), ctrl.deleteVatReturn);

// ─── FX Revaluation ───────────────────────────────────────────────────────────

taxRouter.get('/fx-revaluations', requireRole(UserRole.REPORT_VIEWER), ctrl.listFxRevaluations);
taxRouter.post('/fx-revaluations', requireRole(UserRole.FINANCE_MANAGER), ctrl.runFxRevaluation);
taxRouter.get('/fx-revaluations/:id', requireRole(UserRole.REPORT_VIEWER), ctrl.getFxRevaluation);
taxRouter.post('/fx-revaluations/:id/reverse', requireRole(UserRole.FINANCE_MANAGER), ctrl.reverseFxRevaluation);

// ─── Tax Codes ────────────────────────────────────────────────────────────────

taxRouter.get('/', requireRole(UserRole.REPORT_VIEWER), ctrl.listTaxCodes);
taxRouter.post('/', requireRole(UserRole.ACCOUNTANT), ctrl.createTaxCode);
taxRouter.post('/compute', requireRole(UserRole.REPORT_VIEWER), ctrl.computeTax);
taxRouter.get('/:id', requireRole(UserRole.REPORT_VIEWER), ctrl.getTaxCode);
taxRouter.patch('/:id', requireRole(UserRole.ACCOUNTANT), ctrl.updateTaxCode);
taxRouter.delete('/:id', requireRole(UserRole.FINANCE_MANAGER), ctrl.deleteTaxCode);
