import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import * as payrollController from './payroll.controller';

// Mounted at /api/v1/organisations/:organisationId/payroll
export const payrollRouter = Router({ mergeParams: true });

payrollRouter.use(requireAuth);

// List payroll journal entries — REPORT_VIEWER and above
payrollRouter.get(
  '/',
  requireRole(UserRole.REPORT_VIEWER),
  payrollController.listPayrollEntries,
);

// Process a payroll run — FINANCE_MANAGER and above (creates and posts a journal entry)
payrollRouter.post(
  '/',
  requireRole(UserRole.FINANCE_MANAGER),
  payrollController.processPayroll,
);
