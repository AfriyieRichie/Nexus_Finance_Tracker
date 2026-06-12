import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendCreated, sendNoContent, sendPaginated } from '../../utils/response';
import * as svc from './payroll.service';
import {
  upsertStatutoryConfigSchema,
  createEmployeeSchema,
  updateEmployeeSchema,
  setEmployeeStatusSchema,
  createSalaryComponentSchema,
  updateSalaryComponentSchema,
  assignComponentSchema,
  createLoanSchema,
  updateLoanSchema,
  createPayrollRunSchema,
  listPayrollRunsSchema,
} from './payroll.schemas';

// ─── Statutory Config ─────────────────────────────────────────────────────────

export const listStatutoryConfigs = asyncHandler(async (req: Request, res: Response) => {
  const data = await svc.listStatutoryConfigs(req.params.organisationId);
  return sendSuccess(res, data);
});

export const upsertStatutoryConfig = asyncHandler(async (req: Request, res: Response) => {
  const input = upsertStatutoryConfigSchema.parse(req.body);
  const data = await svc.upsertStatutoryConfig(req.params.organisationId, input);
  return sendCreated(res, data, 'Statutory config saved');
});

// ─── Employees ────────────────────────────────────────────────────────────────

export const listEmployees = asyncHandler(async (req: Request, res: Response) => {
  const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined;
  const data = await svc.listEmployees(req.params.organisationId, isActive);
  return sendSuccess(res, data);
});

export const getEmployee = asyncHandler(async (req: Request, res: Response) => {
  const data = await svc.getEmployee(req.params.organisationId, req.params.id);
  return sendSuccess(res, data);
});

export const createEmployee = asyncHandler(async (req: Request, res: Response) => {
  const input = createEmployeeSchema.parse(req.body);
  const data = await svc.createEmployee(req.params.organisationId, input);
  return sendCreated(res, data, 'Employee created');
});

export const updateEmployee = asyncHandler(async (req: Request, res: Response) => {
  const input = updateEmployeeSchema.parse(req.body);
  const data = await svc.updateEmployee(req.params.organisationId, req.params.id, input);
  return sendSuccess(res, data);
});

export const setEmployeeStatus = asyncHandler(async (req: Request, res: Response) => {
  const input = setEmployeeStatusSchema.parse(req.body);
  const data = await svc.setEmployeeStatus(req.params.organisationId, req.params.id, input);
  return sendSuccess(res, data, `Employee marked ${input.status.toLowerCase()}`);
});

export const assignComponent = asyncHandler(async (req: Request, res: Response) => {
  const input = assignComponentSchema.parse(req.body);
  const data = await svc.assignComponent(req.params.organisationId, req.params.id, input);
  return sendCreated(res, data, 'Component assigned');
});

export const removeComponent = asyncHandler(async (req: Request, res: Response) => {
  await svc.removeComponent(req.params.organisationId, req.params.id, req.params.assignmentId);
  return sendSuccess(res, null, 'Component assignment deactivated');
});

// ─── Employee Loans ───────────────────────────────────────────────────────────

export const listLoans = asyncHandler(async (req: Request, res: Response) => {
  const data = await svc.listLoans(req.params.organisationId, req.params.employeeId);
  return sendSuccess(res, data);
});

export const createLoan = asyncHandler(async (req: Request, res: Response) => {
  const input = createLoanSchema.parse(req.body);
  const data = await svc.createLoan(req.params.organisationId, req.params.employeeId, input, req.user!.sub);
  return sendCreated(res, data, 'Loan created');
});

export const updateLoan = asyncHandler(async (req: Request, res: Response) => {
  const input = updateLoanSchema.parse(req.body);
  const data = await svc.updateLoan(req.params.organisationId, req.params.loanId, input);
  return sendSuccess(res, data);
});

// ─── Salary Components ────────────────────────────────────────────────────────

export const listSalaryComponents = asyncHandler(async (req: Request, res: Response) => {
  const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined;
  const data = await svc.listSalaryComponents(req.params.organisationId, isActive);
  return sendSuccess(res, data);
});

export const createSalaryComponent = asyncHandler(async (req: Request, res: Response) => {
  const input = createSalaryComponentSchema.parse(req.body);
  const data = await svc.createSalaryComponent(req.params.organisationId, input);
  return sendCreated(res, data, 'Salary component created');
});

export const updateSalaryComponent = asyncHandler(async (req: Request, res: Response) => {
  const input = updateSalaryComponentSchema.parse(req.body);
  const data = await svc.updateSalaryComponent(req.params.organisationId, req.params.id, input);
  return sendSuccess(res, data);
});

// ─── Payroll Runs ─────────────────────────────────────────────────────────────

export const listPayrollRuns = asyncHandler(async (req: Request, res: Response) => {
  const { page, pageSize } = listPayrollRunsSchema.parse(req.query);
  const { runs, pagination } = await svc.listPayrollRuns(req.params.organisationId, { page, pageSize });
  return sendPaginated(res, runs, pagination);
});

export const getPayrollRun = asyncHandler(async (req: Request, res: Response) => {
  const data = await svc.getPayrollRun(req.params.organisationId, req.params.id);
  return sendSuccess(res, data);
});

export const createPayrollRun = asyncHandler(async (req: Request, res: Response) => {
  const input = createPayrollRunSchema.parse(req.body);
  const data = await svc.createPayrollRun(req.params.organisationId, req.user!.sub, input);
  return sendCreated(res, data, 'Payroll run created');
});

export const deletePayrollRun = asyncHandler(async (req: Request, res: Response) => {
  await svc.deletePayrollRun(req.params.organisationId, req.params.id);
  return sendNoContent(res);
});

export const submitPayrollRun = asyncHandler(async (req: Request, res: Response) => {
  const data = await svc.submitPayrollRun(req.params.organisationId, req.params.id, req.user!.sub);
  return sendSuccess(res, data, 'Payroll run submitted for approval');
});

export const approvePayrollRun = asyncHandler(async (req: Request, res: Response) => {
  const data = await svc.approvePayrollRun(req.params.organisationId, req.params.id, req.user!.sub);
  return sendSuccess(res, data, 'Payroll run approved');
});

export const payPayrollRun = asyncHandler(async (req: Request, res: Response) => {
  const data = await svc.payPayrollRun(req.params.organisationId, req.params.id, req.user!.sub);
  return sendSuccess(res, data, 'Payroll run marked as paid and GL posted');
});

export const lockPayrollRun = asyncHandler(async (req: Request, res: Response) => {
  const data = await svc.lockPayrollRun(req.params.organisationId, req.params.id, req.user!.sub);
  return sendSuccess(res, data, 'Payroll run locked');
});

export const downloadPaymentFile = asyncHandler(async (req: Request, res: Response) => {
  const csv = await svc.generatePaymentFile(req.params.organisationId, req.params.id);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="payment-${req.params.id}.csv"`);
  res.send(csv);
});

// ─── Legacy ───────────────────────────────────────────────────────────────────

export const processPayroll = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as Partial<svc.PayrollInput>;
  const requiredStrings = ['periodId', 'payrollDate', 'description', 'wagesAccountId', 'taxPayableAccountId', 'pensionPayableAccountId', 'bankAccountId'] as const;
  for (const field of requiredStrings) {
    if (!body[field] || typeof body[field] !== 'string') throw new Error(`${field} is required`);
  }
  const entry = await svc.processPayroll(req.params.organisationId, req.user!.sub, body as svc.PayrollInput);
  return sendCreated(res, entry, `Payroll journal entry ${entry.journalNumber} created and posted`);
});

export const listPayrollEntries = asyncHandler(async (req: Request, res: Response) => {
  const page     = req.query.page     ? Math.max(1, parseInt(req.query.page     as string, 10)) : 1;
  const pageSize = req.query.pageSize ? Math.min(200, parseInt(req.query.pageSize as string, 10)) : 50;
  const { entries, pagination } = await svc.listPayrollEntries(req.params.organisationId, { page, pageSize });
  return sendPaginated(res, entries, pagination);
});

// ─── Reports ────────────────────────────────────────────────────────────────

import * as reports from './payroll.reports';

function reportFilters(req: Request): reports.ReportFilters {
  const q = req.query;
  return {
    runId: (q.runId as string) || undefined,
    year: q.year ? parseInt(q.year as string, 10) : undefined,
    month: q.month ? parseInt(q.month as string, 10) : undefined,
    departmentId: (q.departmentId as string) || undefined,
    employeeId: (q.employeeId as string) || undefined,
  };
}

export const reportRegister = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await reports.getPayrollRegister(req.params.organisationId, reportFilters(req)));
});

export const reportStatutory = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await reports.getStatutoryReport(req.params.organisationId, reportFilters(req)));
});

export const reportGlSummary = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await reports.getPayrollGlSummary(req.params.organisationId, req.query.runId as string));
});

export const reportBank = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await reports.getBankDisbursement(req.params.organisationId, reportFilters(req)));
});

export const reportDepartment = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await reports.getDepartmentCostAnalysis(req.params.organisationId, reportFilters(req)));
});

export const reportEmployeeYtd = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await reports.getEmployeeYtd(req.params.organisationId, reportFilters(req)));
});
