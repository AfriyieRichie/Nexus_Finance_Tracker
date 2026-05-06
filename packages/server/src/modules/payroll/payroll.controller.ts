import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendCreated, sendPaginated } from '../../utils/response';
import { ValidationError } from '../../utils/errors';
import * as svc from './payroll.service';

// ─── Statutory Config ─────────────────────────────────────────────────────────

export const listStatutoryConfigs = asyncHandler(async (req: Request, res: Response) => {
  const data = await svc.listStatutoryConfigs(req.params.organisationId);
  return sendSuccess(res, data);
});

export const upsertStatutoryConfig = asyncHandler(async (req: Request, res: Response) => {
  const taxYear = parseInt(req.body.taxYear, 10);
  if (!taxYear || isNaN(taxYear)) throw new ValidationError('taxYear is required');
  const data = await svc.upsertStatutoryConfig(req.params.organisationId, { ...req.body, taxYear });
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
  const { employeeNumber, firstName, lastName, startDate, basicSalary } = req.body;
  if (!employeeNumber || !firstName || !lastName || !startDate || basicSalary === undefined) {
    throw new ValidationError('employeeNumber, firstName, lastName, startDate, and basicSalary are required');
  }
  const data = await svc.createEmployee(req.params.organisationId, req.body);
  return sendCreated(res, data, 'Employee created');
});

export const updateEmployee = asyncHandler(async (req: Request, res: Response) => {
  const data = await svc.updateEmployee(req.params.organisationId, req.params.id, req.body);
  return sendSuccess(res, data);
});

export const assignComponent = asyncHandler(async (req: Request, res: Response) => {
  const { componentId, effectiveFrom } = req.body;
  if (!componentId || !effectiveFrom) throw new ValidationError('componentId and effectiveFrom are required');
  const data = await svc.assignComponent(req.params.organisationId, req.params.id, req.body);
  return sendCreated(res, data, 'Component assigned');
});

export const removeComponent = asyncHandler(async (req: Request, res: Response) => {
  await svc.removeComponent(req.params.organisationId, req.params.id, req.params.assignmentId);
  return sendSuccess(res, null, 'Component assignment deactivated');
});

// ─── Salary Components ────────────────────────────────────────────────────────

export const listSalaryComponents = asyncHandler(async (req: Request, res: Response) => {
  const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined;
  const data = await svc.listSalaryComponents(req.params.organisationId, isActive);
  return sendSuccess(res, data);
});

export const createSalaryComponent = asyncHandler(async (req: Request, res: Response) => {
  const { code, name, type } = req.body;
  if (!code || !name || !type) throw new ValidationError('code, name, and type are required');
  const data = await svc.createSalaryComponent(req.params.organisationId, req.body);
  return sendCreated(res, data, 'Salary component created');
});

export const updateSalaryComponent = asyncHandler(async (req: Request, res: Response) => {
  const data = await svc.updateSalaryComponent(req.params.organisationId, req.params.id, req.body);
  return sendSuccess(res, data);
});

// ─── Payroll Runs ─────────────────────────────────────────────────────────────

export const listPayrollRuns = asyncHandler(async (req: Request, res: Response) => {
  const page     = req.query.page     ? parseInt(req.query.page     as string, 10) : 1;
  const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 20;
  const { runs, pagination } = await svc.listPayrollRuns(req.params.organisationId, { page, pageSize });
  return sendPaginated(res, runs, pagination);
});

export const getPayrollRun = asyncHandler(async (req: Request, res: Response) => {
  const data = await svc.getPayrollRun(req.params.organisationId, req.params.id);
  return sendSuccess(res, data);
});

export const createPayrollRun = asyncHandler(async (req: Request, res: Response) => {
  const { periodId, paymentDate, description, wagesPayableAccountId, payePayableAccountId, ssnitPayableAccountId, pensionPayableAccountId } = req.body;
  if (!periodId || !paymentDate || !description || !wagesPayableAccountId || !payePayableAccountId || !ssnitPayableAccountId || !pensionPayableAccountId) {
    throw new ValidationError('periodId, paymentDate, description, wagesPayableAccountId, payePayableAccountId, ssnitPayableAccountId, pensionPayableAccountId are required');
  }
  const data = await svc.createPayrollRun(req.params.organisationId, req.user!.sub, req.body);
  return sendCreated(res, data, 'Payroll run created');
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
    if (!body[field] || typeof body[field] !== 'string') throw new ValidationError(`${field} is required`);
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
