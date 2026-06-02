import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { getDashboardData } from './dashboard.controller';

// Mounted at /api/v1/organisations/:organisationId/dashboard
export const dashboardRouter = Router({ mergeParams: true });
dashboardRouter.use(requireAuth);

dashboardRouter.get('/', requireRole(UserRole.REPORT_VIEWER), getDashboardData);
