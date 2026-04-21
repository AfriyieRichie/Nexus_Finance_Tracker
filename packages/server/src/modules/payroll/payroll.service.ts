import { JournalType, EntryStatus } from '@prisma/client';
import { prisma } from '../../config/database';
import { ValidationError } from '../../utils/errors';
import { buildPagination } from '../../utils/response';
import {
  createJournalEntry,
  postJournalEntry,
} from '../journals/journal.service';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PayrollInput {
  periodId: string;
  payrollDate: string; // ISO date YYYY-MM-DD
  description: string;
  grossSalaries: number;       // debit: wages expense account
  payeTax: number;             // credit: tax payable account
  pensionEmployee: number;     // credit: pension payable account
  pensionEmployer: number;     // debit: wages expense, credit: pension payable
  otherDeductions: number;     // credit: other payables
  netPay: number;              // credit: bank account
  // account IDs
  wagesAccountId: string;
  taxPayableAccountId: string;
  pensionPayableAccountId: string;
  bankAccountId: string;
  otherPayablesAccountId?: string;
}

export interface ListPayrollParams {
  page?: number;
  pageSize?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// ─── Payroll Processing ───────────────────────────────────────────────────────

export async function processPayroll(
  organisationId: string,
  userId: string,
  input: PayrollInput,
) {
  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.payrollDate)) {
    throw new ValidationError('payrollDate must be in YYYY-MM-DD format');
  }

  // Validate all amounts are non-negative
  const amounts: Array<[string, number]> = [
    ['grossSalaries', input.grossSalaries],
    ['payeTax', input.payeTax],
    ['pensionEmployee', input.pensionEmployee],
    ['pensionEmployer', input.pensionEmployer],
    ['otherDeductions', input.otherDeductions],
    ['netPay', input.netPay],
  ];
  for (const [field, value] of amounts) {
    if (typeof value !== 'number' || value < 0) {
      throw new ValidationError(`${field} must be a non-negative number`);
    }
  }

  // Validate balance:
  // DR: grossSalaries + pensionEmployer
  // CR: payeTax + pensionEmployee + pensionEmployer + otherDeductions + netPay
  const totalDebit = round4(input.grossSalaries + input.pensionEmployer);
  const totalCredit = round4(
    input.payeTax +
      input.pensionEmployee +
      input.pensionEmployer +
      input.otherDeductions +
      input.netPay,
  );

  if (totalDebit !== totalCredit) {
    throw new ValidationError(
      `Payroll entry is unbalanced: debits (${totalDebit}) ≠ credits (${totalCredit}). ` +
        'Verify: grossSalaries + pensionEmployer = payeTax + pensionEmployee + pensionEmployer + otherDeductions + netPay',
    );
  }

  if (input.otherDeductions > 0 && !input.otherPayablesAccountId) {
    throw new ValidationError(
      'otherPayablesAccountId is required when otherDeductions > 0',
    );
  }

  // Get organisation base currency
  const org = await prisma.organisation.findUnique({
    where: { id: organisationId },
    select: { baseCurrency: true },
  });
  if (!org) throw new ValidationError('Organisation not found');

  const currency = org.baseCurrency;

  // Build journal lines
  // DR Wages Expense: grossSalaries + pensionEmployer
  const drWages = round4(input.grossSalaries + input.pensionEmployer);

  // CR Tax Payable: payeTax
  // CR Pension Payable: pensionEmployee + pensionEmployer
  // CR Other Payables: otherDeductions (if > 0)
  // CR Bank: netPay

  type LineInput = {
    accountId: string;
    description?: string;
    debitAmount: number;
    creditAmount: number;
    currency: string;
    exchangeRate: number;
  };

  const lines: LineInput[] = [
    {
      accountId: input.wagesAccountId,
      description: 'Gross wages & employer pension',
      debitAmount: drWages,
      creditAmount: 0,
      currency,
      exchangeRate: 1,
    },
    {
      accountId: input.taxPayableAccountId,
      description: 'PAYE tax payable',
      debitAmount: 0,
      creditAmount: input.payeTax,
      currency,
      exchangeRate: 1,
    },
    {
      accountId: input.pensionPayableAccountId,
      description: 'Pension payable (employee + employer)',
      debitAmount: 0,
      creditAmount: round4(input.pensionEmployee + input.pensionEmployer),
      currency,
      exchangeRate: 1,
    },
    {
      accountId: input.bankAccountId,
      description: 'Net pay disbursed',
      debitAmount: 0,
      creditAmount: input.netPay,
      currency,
      exchangeRate: 1,
    },
  ];

  if (input.otherDeductions > 0 && input.otherPayablesAccountId) {
    lines.push({
      accountId: input.otherPayablesAccountId,
      description: 'Other deductions payable',
      debitAmount: 0,
      creditAmount: input.otherDeductions,
      currency,
      exchangeRate: 1,
    });
  }

  // Create the journal entry as DRAFT
  const journalEntry = await createJournalEntry(
    organisationId,
    {
      type: JournalType.PAYROLL,
      description: input.description,
      entryDate: input.payrollDate,
      periodId: input.periodId,
      currency,
      exchangeRate: 1,
      lines,
    },
    userId,
  );

  // Auto-approve system-generated payroll entry (same pattern as reversal auto-approve)
  await prisma.journalEntry.update({
    where: { id: journalEntry.id },
    data: {
      status: EntryStatus.APPROVED,
      approvedBy: userId,
      approvedAt: new Date(),
    },
  });

  // Post to ledger
  const posted = await postJournalEntry(organisationId, journalEntry.id, userId);

  return posted;
}

// ─── List Payroll Entries ─────────────────────────────────────────────────────

export async function listPayrollEntries(
  organisationId: string,
  params: ListPayrollParams,
) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, params.pageSize ?? 50));

  const where = {
    organisationId,
    type: JournalType.PAYROLL,
  };

  const [total, entries] = await Promise.all([
    prisma.journalEntry.count({ where }),
    prisma.journalEntry.findMany({
      where,
      orderBy: [{ entryDate: 'desc' }, { journalNumber: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        lines: {
          orderBy: { lineNumber: 'asc' },
          include: {
            account: { select: { code: true, name: true, class: true, type: true } },
          },
        },
        creator: { select: { id: true, firstName: true, lastName: true } },
        poster: { select: { id: true, firstName: true, lastName: true } },
        period: { select: { name: true, fiscalYear: true, periodNumber: true } },
        _count: { select: { lines: true } },
      },
    }),
  ]);

  return {
    entries,
    pagination: buildPagination(page, pageSize, total),
  };
}
