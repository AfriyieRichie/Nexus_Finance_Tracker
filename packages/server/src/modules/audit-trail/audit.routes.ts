import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import * as auditController from './audit.controller';

// Mounted at /api/v1/organisations/:organisationId/audit
export const auditRouter = Router({ mergeParams: true });

auditRouter.use(requireAuth);

// Auditors and above can read audit logs
auditRouter.get('/', requireRole(UserRole.AUDITOR), auditController.listAuditLogs);
auditRouter.get('/:logId', requireRole(UserRole.AUDITOR), auditController.getAuditLog);
