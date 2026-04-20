import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import * as ledgerController from './ledger.controller';

// Two separate routers — mounted at different paths in app.ts

// /api/v1/organisations/:organisationId/accounts/:accountId/ledger
export const accountLedgerRouter = Router({ mergeParams: true });
accountLedgerRouter.use(requireAuth);
accountLedgerRouter.get('/', requireRole(UserRole.ACCOUNTANT), ledgerController.getAccountLedger);

// /api/v1/organisations/:organisationId/ledger
export const ledgerRouter = Router({ mergeParams: true });
ledgerRouter.use(requireAuth);
ledgerRouter.get('/trial-balance', requireRole(UserRole.ACCOUNTANT), ledgerController.getTrialBalance);
ledgerRouter.get('/summary/:periodId', requireRole(UserRole.ACCOUNTANT), ledgerController.getLedgerSummary);
