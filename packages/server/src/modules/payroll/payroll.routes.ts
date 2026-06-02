import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import * as ctrl from './payroll.controller';

const { REPORT_VIEWER, ACCOUNTANT, FINANCE_MANAGER } = UserRole;

// Mounted at /api/v1/organisations/:organisationId/payroll
export const payrollRouter = Router({ mergeParams: true });
payrollRouter.use(requireAuth);

// ─── Statutory Config ─────────────────────────────────────────────────────────
payrollRouter.get('/statutory-config',          requireRole(REPORT_VIEWER),   ctrl.listStatutoryConfigs);
payrollRouter.post('/statutory-config',         requireRole(FINANCE_MANAGER), ctrl.upsertStatutoryConfig);

// ─── Salary Components ────────────────────────────────────────────────────────
payrollRouter.get('/salary-components',         requireRole(REPORT_VIEWER),   ctrl.listSalaryComponents);
payrollRouter.post('/salary-components',        requireRole(FINANCE_MANAGER), ctrl.createSalaryComponent);
payrollRouter.patch('/salary-components/:id',   requireRole(FINANCE_MANAGER), ctrl.updateSalaryComponent);

// ─── Employees ────────────────────────────────────────────────────────────────
payrollRouter.get('/employees',                 requireRole(REPORT_VIEWER),   ctrl.listEmployees);
payrollRouter.post('/employees',                requireRole(FINANCE_MANAGER), ctrl.createEmployee);
payrollRouter.get('/employees/:id',             requireRole(REPORT_VIEWER),   ctrl.getEmployee);
payrollRouter.patch('/employees/:id',           requireRole(FINANCE_MANAGER), ctrl.updateEmployee);
payrollRouter.post('/employees/:id/components', requireRole(FINANCE_MANAGER), ctrl.assignComponent);
payrollRouter.delete('/employees/:id/components/:assignmentId', requireRole(FINANCE_MANAGER), ctrl.removeComponent);
payrollRouter.get('/employees/:employeeId/loans',              requireRole(REPORT_VIEWER),   ctrl.listLoans);
payrollRouter.post('/employees/:employeeId/loans',             requireRole(FINANCE_MANAGER), ctrl.createLoan);
payrollRouter.patch('/employees/:employeeId/loans/:loanId',    requireRole(FINANCE_MANAGER), ctrl.updateLoan);

// ─── Payroll Runs ─────────────────────────────────────────────────────────────
payrollRouter.get('/runs',                      requireRole(REPORT_VIEWER),   ctrl.listPayrollRuns);
payrollRouter.post('/runs',                     requireRole(ACCOUNTANT),      ctrl.createPayrollRun);
payrollRouter.get('/runs/:id',                  requireRole(REPORT_VIEWER),   ctrl.getPayrollRun);
payrollRouter.delete('/runs/:id',               requireRole(ACCOUNTANT),      ctrl.deletePayrollRun);
payrollRouter.post('/runs/:id/submit',          requireRole(ACCOUNTANT),      ctrl.submitPayrollRun);
payrollRouter.post('/runs/:id/approve',         requireRole(FINANCE_MANAGER), ctrl.approvePayrollRun);
payrollRouter.post('/runs/:id/pay',             requireRole(FINANCE_MANAGER), ctrl.payPayrollRun);
payrollRouter.post('/runs/:id/lock',            requireRole(FINANCE_MANAGER), ctrl.lockPayrollRun);
payrollRouter.get('/runs/:id/payment-file',     requireRole(FINANCE_MANAGER), ctrl.downloadPaymentFile);

// ─── Legacy journal-based payroll ────────────────────────────────────────────
payrollRouter.get('/',                          requireRole(REPORT_VIEWER),   ctrl.listPayrollEntries);
payrollRouter.post('/',                         requireRole(FINANCE_MANAGER), ctrl.processPayroll);
