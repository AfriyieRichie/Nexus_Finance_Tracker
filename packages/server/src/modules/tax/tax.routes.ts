import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import * as taxController from './tax.controller';

// Mounted at /api/v1/organisations/:organisationId/tax
export const taxRouter = Router({ mergeParams: true });

taxRouter.use(requireAuth);

// ─── Exchange Rate Routes (/exchange-rates/*) ─────────────────────────────────
// Must be declared before /:id to avoid route shadowing

taxRouter.get(
  '/exchange-rates/latest',
  requireRole(UserRole.REPORT_VIEWER),
  taxController.getLatestRate,
);

taxRouter.get(
  '/exchange-rates',
  requireRole(UserRole.REPORT_VIEWER),
  taxController.listExchangeRates,
);

taxRouter.post(
  '/exchange-rates',
  requireRole(UserRole.ACCOUNTANT),
  taxController.upsertExchangeRate,
);

// ─── Tax Code Routes ──────────────────────────────────────────────────────────
// Specific paths must come before parameterised /:id routes

taxRouter.get('/', requireRole(UserRole.REPORT_VIEWER), taxController.listTaxCodes);
taxRouter.post('/', requireRole(UserRole.ACCOUNTANT), taxController.createTaxCode);
taxRouter.post('/compute', requireRole(UserRole.REPORT_VIEWER), taxController.computeTax);
taxRouter.get('/:id', requireRole(UserRole.REPORT_VIEWER), taxController.getTaxCode);
taxRouter.patch('/:id', requireRole(UserRole.ACCOUNTANT), taxController.updateTaxCode);
taxRouter.delete('/:id', requireRole(UserRole.FINANCE_MANAGER), taxController.deleteTaxCode);
