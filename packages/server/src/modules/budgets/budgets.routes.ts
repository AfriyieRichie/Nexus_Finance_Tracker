import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import * as ctrl from './budgets.controller';

// Mounted at /api/v1/organisations/:organisationId/budgets
export const budgetsRouter = Router({ mergeParams: true });
budgetsRouter.use(requireAuth);

// ─── Static prefixes (must come before /:budgetId) ────────────────────────────

budgetsRouter.get('/cost-centres', requireRole(UserRole.REPORT_VIEWER), ctrl.listCostCentres);
budgetsRouter.post('/cost-centres', requireRole(UserRole.FINANCE_MANAGER), ctrl.createCostCentre);
budgetsRouter.patch('/cost-centres/:id', requireRole(UserRole.FINANCE_MANAGER), ctrl.updateCostCentre);

budgetsRouter.get('/departments', requireRole(UserRole.REPORT_VIEWER), ctrl.listDepartments);
budgetsRouter.post('/departments', requireRole(UserRole.FINANCE_MANAGER), ctrl.createDepartment);
budgetsRouter.patch('/departments/:id', requireRole(UserRole.FINANCE_MANAGER), ctrl.updateDepartment);

budgetsRouter.get('/segment-report', requireRole(UserRole.REPORT_VIEWER), ctrl.getSegmentReport);

// ─── Budget collection ────────────────────────────────────────────────────────

budgetsRouter.get('/', requireRole(UserRole.REPORT_VIEWER), ctrl.listBudgets);
budgetsRouter.post('/', requireRole(UserRole.FINANCE_MANAGER), ctrl.createBudget);

// ─── Budget instance ──────────────────────────────────────────────────────────

budgetsRouter.get('/:budgetId', requireRole(UserRole.REPORT_VIEWER), ctrl.getBudget);
budgetsRouter.patch('/:budgetId', requireRole(UserRole.FINANCE_MANAGER), ctrl.updateBudget);
budgetsRouter.delete('/:budgetId', requireRole(UserRole.FINANCE_MANAGER), ctrl.deleteBudget);

budgetsRouter.get('/:budgetId/variance', requireRole(UserRole.REPORT_VIEWER), ctrl.getBudgetVsActual);
budgetsRouter.put('/:budgetId/lines', requireRole(UserRole.FINANCE_MANAGER), ctrl.updateBudgetLines);
budgetsRouter.post('/:budgetId/import', requireRole(UserRole.FINANCE_MANAGER), ctrl.importBudgetLines);
budgetsRouter.post('/:budgetId/copy', requireRole(UserRole.FINANCE_MANAGER), ctrl.copyBudget);
budgetsRouter.post('/:budgetId/approve', requireRole(UserRole.ORG_ADMIN), ctrl.approveBudget);

// ─── Commitments ──────────────────────────────────────────────────────────────

budgetsRouter.get('/:budgetId/commitments', requireRole(UserRole.REPORT_VIEWER), ctrl.listCommitments);
budgetsRouter.post('/:budgetId/commitments', requireRole(UserRole.ACCOUNTANT), ctrl.createCommitment);
budgetsRouter.patch('/:budgetId/commitments/:commitmentId', requireRole(UserRole.ACCOUNTANT), ctrl.updateCommitment);
