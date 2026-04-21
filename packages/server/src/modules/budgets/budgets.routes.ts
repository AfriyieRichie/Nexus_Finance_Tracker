import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import * as budgetsController from './budgets.controller';

// Mounted at /api/v1/organisations/:organisationId/budgets
export const budgetsRouter = Router({ mergeParams: true });

budgetsRouter.use(requireAuth);

// ─── Cost Centres (static prefix — must come before /:budgetId) ───────────────

budgetsRouter.get(
  '/cost-centres',
  requireRole(UserRole.REPORT_VIEWER),
  budgetsController.listCostCentres,
);
budgetsRouter.post(
  '/cost-centres',
  requireRole(UserRole.FINANCE_MANAGER),
  budgetsController.createCostCentre,
);
budgetsRouter.patch(
  '/cost-centres/:id',
  requireRole(UserRole.FINANCE_MANAGER),
  budgetsController.updateCostCentre,
);

// ─── Departments (static prefix — must come before /:budgetId) ───────────────

budgetsRouter.get(
  '/departments',
  requireRole(UserRole.REPORT_VIEWER),
  budgetsController.listDepartments,
);
budgetsRouter.post(
  '/departments',
  requireRole(UserRole.FINANCE_MANAGER),
  budgetsController.createDepartment,
);
budgetsRouter.patch(
  '/departments/:id',
  requireRole(UserRole.FINANCE_MANAGER),
  budgetsController.updateDepartment,
);

// ─── Budgets ──────────────────────────────────────────────────────────────────

// Collection
budgetsRouter.get('/', requireRole(UserRole.REPORT_VIEWER), budgetsController.listBudgets);
budgetsRouter.post('/', requireRole(UserRole.FINANCE_MANAGER), budgetsController.createBudget);

// Single budget — parameterised routes after all static paths
budgetsRouter.get(
  '/:budgetId',
  requireRole(UserRole.REPORT_VIEWER),
  budgetsController.getBudget,
);
budgetsRouter.get(
  '/:budgetId/variance',
  requireRole(UserRole.REPORT_VIEWER),
  budgetsController.getBudgetVsActual,
);
budgetsRouter.put(
  '/:budgetId/lines',
  requireRole(UserRole.FINANCE_MANAGER),
  budgetsController.updateBudgetLines,
);
budgetsRouter.post(
  '/:budgetId/approve',
  requireRole(UserRole.ORG_ADMIN),
  budgetsController.approveBudget,
);
budgetsRouter.delete(
  '/:budgetId',
  requireRole(UserRole.FINANCE_MANAGER),
  budgetsController.deleteBudget,
);
