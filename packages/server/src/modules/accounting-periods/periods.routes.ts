import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import * as periodsController from './periods.controller';

// Mounted at /api/v1/organisations/:organisationId/periods
export const periodsRouter = Router({ mergeParams: true });

periodsRouter.use(requireAuth);

// Read
periodsRouter.get('/', requireRole(UserRole.REPORT_VIEWER), periodsController.listPeriods);
periodsRouter.get('/current', requireRole(UserRole.REPORT_VIEWER), periodsController.getCurrentPeriod);
periodsRouter.get('/:periodId', requireRole(UserRole.REPORT_VIEWER), periodsController.getPeriod);

// Create fiscal year — Finance Manager and above
periodsRouter.post('/', requireRole(UserRole.FINANCE_MANAGER), periodsController.createFiscalYear);

// Status transitions — Finance Manager and above
periodsRouter.post('/:periodId/close', requireRole(UserRole.FINANCE_MANAGER), periodsController.closePeriod);
periodsRouter.post('/:periodId/reopen', requireRole(UserRole.FINANCE_MANAGER), periodsController.reopenPeriod);

// Lock and year-end close — ORG_ADMIN only (irreversible)
periodsRouter.post('/:periodId/lock', requireRole(UserRole.ORG_ADMIN), periodsController.lockPeriod);
periodsRouter.post('/year-end-close', requireRole(UserRole.ORG_ADMIN), periodsController.yearEndClose);
