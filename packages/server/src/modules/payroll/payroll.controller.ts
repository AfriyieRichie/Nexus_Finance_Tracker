import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendCreated, sendPaginated } from '../../utils/response';
import { ValidationError } from '../../utils/errors';
import * as payrollService from './payroll.service';
import type { PayrollInput } from './payroll.service';

// ─── Process Payroll ──────────────────────────────────────────────────────────

export const processPayroll = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const userId = req.user!.sub;

  const body = req.body as Partial<PayrollInput>;

  // Required field validation
  const requiredStrings: Array<keyof PayrollInput> = [
    'periodId',
    'payrollDate',
    'description',
    'wagesAccountId',
    'taxPayableAccountId',
    'pensionPayableAccountId',
    'bankAccountId',
  ];
  for (const field of requiredStrings) {
    if (!body[field] || typeof body[field] !== 'string') {
      throw new ValidationError(`${field} is required and must be a string`);
    }
  }

  const requiredNumbers: Array<keyof PayrollInput> = [
    'grossSalaries',
    'payeTax',
    'pensionEmployee',
    'pensionEmployer',
    'otherDeductions',
    'netPay',
  ];
  for (const field of requiredNumbers) {
    if (body[field] === undefined || typeof body[field] !== 'number') {
      throw new ValidationError(`${field} is required and must be a number`);
    }
  }

  const input: PayrollInput = {
    periodId: body.periodId!,
    payrollDate: body.payrollDate!,
    description: body.description!,
    grossSalaries: body.grossSalaries!,
    payeTax: body.payeTax!,
    pensionEmployee: body.pensionEmployee!,
    pensionEmployer: body.pensionEmployer!,
    otherDeductions: body.otherDeductions!,
    netPay: body.netPay!,
    wagesAccountId: body.wagesAccountId!,
    taxPayableAccountId: body.taxPayableAccountId!,
    pensionPayableAccountId: body.pensionPayableAccountId!,
    bankAccountId: body.bankAccountId!,
    otherPayablesAccountId: body.otherPayablesAccountId,
  };

  const entry = await payrollService.processPayroll(organisationId, userId, input);
  return sendCreated(
    res,
    entry,
    `Payroll journal entry ${entry.journalNumber} created and posted`,
  );
});

// ─── List Payroll Entries ─────────────────────────────────────────────────────

export const listPayrollEntries = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;

  const page = req.query.page
    ? Math.max(1, parseInt(req.query.page as string, 10))
    : 1;
  const pageSize = req.query.pageSize
    ? Math.min(200, Math.max(1, parseInt(req.query.pageSize as string, 10)))
    : 50;

  const { entries, pagination } = await payrollService.listPayrollEntries(
    organisationId,
    { page, pageSize },
  );

  return sendPaginated(res, entries, pagination);
});
