import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import * as coaController from './coa.controller';

// Mounted at /api/v1/organisations/:organisationId/accounts
export const coaRouter = Router({ mergeParams: true });

coaRouter.use(requireAuth);

// List & hierarchy (read-only roles)
coaRouter.get('/', requireRole(UserRole.REPORT_VIEWER), coaController.listAccounts);
coaRouter.get('/hierarchy', requireRole(UserRole.REPORT_VIEWER), coaController.getAccountHierarchy);

// Template import — ORG_ADMIN only; blocked if accounts already exist
coaRouter.post('/import-template', requireRole(UserRole.ORG_ADMIN), coaController.importTemplate);

// Single account CRUD
coaRouter.post('/', requireRole(UserRole.FINANCE_MANAGER), coaController.createAccount);
coaRouter.get('/:accountId', requireRole(UserRole.REPORT_VIEWER), coaController.getAccount);
coaRouter.patch('/:accountId', requireRole(UserRole.FINANCE_MANAGER), coaController.updateAccount);
coaRouter.delete('/:accountId', requireRole(UserRole.ORG_ADMIN), coaController.deleteAccount);

// Balance as-of query
coaRouter.get('/:accountId/balance', requireRole(UserRole.ACCOUNTANT), coaController.getAccountBalance);
