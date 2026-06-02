import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import * as auditController from './audit.controller';

// Mounted at /api/v1/organisations/:organisationId/audit
export const auditRouter = Router({ mergeParams: true });

auditRouter.use(requireAuth);

auditRouter.get('/export',   requireRole(UserRole.AUDITOR, UserRole.ORG_ADMIN), auditController.exportCsv);
auditRouter.get('/',         requireRole(UserRole.AUDITOR, UserRole.ORG_ADMIN), auditController.listAuditLogs);
auditRouter.get('/:logId',   requireRole(UserRole.AUDITOR, UserRole.ORG_ADMIN), auditController.getAuditLog);
