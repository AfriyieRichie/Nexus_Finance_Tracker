import { PeriodStatus } from '@prisma/client';
import { prisma } from '../../config/database';
import { ConflictError, NotFoundError, ForbiddenError, ValidationError } from '../../utils/errors';
import type { CreateFiscalYearInput, ListPeriodsQuery } from './periods.schemas';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

function lastDayOf(year: number, month: number): Date {
  // month is 1-based; day 0 of next month = last day of this month
  return new Date(Date.UTC(year, month, 0));
}

// ─── Create Fiscal Year ───────────────────────────────────────────────────────

export async function createFiscalYear(
  organisationId: string,
  input: CreateFiscalYearInput,
  _userId: string,
) {
  const org = await prisma.organisation.findUnique({
    where: { id: organisationId },
    select: { fiscalYearStart: true },
  });
  if (!org) throw new NotFoundError('Organisation not found');

  const existing = await prisma.accountingPeriod.findFirst({
    where: { organisationId, fiscalYear: input.fiscalYear },
  });
  if (existing) {
    throw new ConflictError(`Fiscal year ${input.fiscalYear} already exists for this organisation`);
  }

  const startDate = new Date(input.startDate + 'T00:00:00Z');
  if (isNaN(startDate.getTime())) throw new ValidationError('Invalid startDate');

  const periods = [];
  for (let i = 0; i < 12; i++) {
    const periodStart = addMonths(startDate, i);
    const monthNum = periodStart.getUTCMonth(); // 0-based
    const year = periodStart.getUTCFullYear();
    const periodEnd = lastDayOf(year, monthNum + 1);

    periods.push({
      organisationId,
      fiscalYear: input.fiscalYear,
      periodNumber: i + 1,
      name: `${MONTH_NAMES[monthNum]} ${year}`,
      startDate: periodStart,
      endDate: periodEnd,
      status: PeriodStatus.OPEN,
    });
  }

  await prisma.accountingPeriod.createMany({ data: periods });

  return prisma.accountingPeriod.findMany({
    where: { organisationId, fiscalYear: input.fiscalYear },
    orderBy: { periodNumber: 'asc' },
  });
}

// ─── List Periods ─────────────────────────────────────────────────────────────

export async function listPeriods(organisationId: string, query: ListPeriodsQuery) {
  return prisma.accountingPeriod.findMany({
    where: {
      organisationId,
      ...(query.fiscalYear && { fiscalYear: query.fiscalYear }),
      ...(query.status && { status: query.status }),
    },
    orderBy: [{ fiscalYear: 'asc' }, { periodNumber: 'asc' }],
  });
}

// ─── Get Period ───────────────────────────────────────────────────────────────

export async function getPeriod(organisationId: string, periodId: string) {
  const period = await prisma.accountingPeriod.findFirst({
    where: { id: periodId, organisationId },
  });
  if (!period) throw new NotFoundError('Accounting period not found');
  return period;
}

// ─── Get Current Open Period ──────────────────────────────────────────────────

export async function getCurrentPeriod(organisationId: string) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const period = await prisma.accountingPeriod.findFirst({
    where: {
      organisationId,
      status: PeriodStatus.OPEN,
      startDate: { lte: today },
      endDate: { gte: today },
    },
    orderBy: { startDate: 'asc' },
  });

  return period ?? null;
}

// ─── Status Transitions ───────────────────────────────────────────────────────

export async function closePeriod(organisationId: string, periodId: string, userId: string) {
  const period = await getPeriod(organisationId, periodId);

  if (period.status !== PeriodStatus.OPEN) {
    throw new ForbiddenError('Only OPEN periods can be closed');
  }

  // Block close if there are unposted journal entries in this period
  const unposted = await prisma.journalEntry.count({
    where: {
      organisationId,
      periodId,
      status: { in: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED'] },
    },
  });
  if (unposted > 0) {
    throw new ForbiddenError(
      `Cannot close period: ${unposted} unposted journal entr${unposted === 1 ? 'y' : 'ies'} remain`,
    );
  }

  return prisma.accountingPeriod.update({
    where: { id: periodId },
    data: { status: PeriodStatus.CLOSED, closedBy: userId, closedAt: new Date() },
  });
}

export async function reopenPeriod(organisationId: string, periodId: string) {
  const period = await getPeriod(organisationId, periodId);

  if (period.status === PeriodStatus.LOCKED) {
    throw new ForbiddenError('LOCKED periods cannot be reopened. This is a permanent year-end lock.');
  }
  if (period.status === PeriodStatus.OPEN) {
    throw new ForbiddenError('Period is already OPEN');
  }

  return prisma.accountingPeriod.update({
    where: { id: periodId },
    data: { status: PeriodStatus.OPEN, closedBy: null, closedAt: null },
  });
}

export async function lockPeriod(organisationId: string, periodId: string, userId: string) {
  const period = await getPeriod(organisationId, periodId);

  if (period.status !== PeriodStatus.CLOSED) {
    throw new ForbiddenError('Only CLOSED periods can be locked. Close the period first.');
  }

  return prisma.accountingPeriod.update({
    where: { id: periodId },
    data: { status: PeriodStatus.LOCKED, closedBy: userId, closedAt: new Date() },
  });
}

// ─── Year-End Close ───────────────────────────────────────────────────────────

export async function yearEndClose(
  organisationId: string,
  fiscalYear: number,
  userId: string,
): Promise<{ locked: number }> {
  const periods = await prisma.accountingPeriod.findMany({
    where: { organisationId, fiscalYear },
    orderBy: { periodNumber: 'asc' },
  });

  if (periods.length === 0) {
    throw new NotFoundError(`No periods found for fiscal year ${fiscalYear}`);
  }

  const notClosed = periods.filter((p) => p.status !== PeriodStatus.CLOSED);
  if (notClosed.length > 0) {
    throw new ForbiddenError(
      `All periods must be CLOSED before year-end lock. ${notClosed.length} period(s) are not closed.`,
    );
  }

  await prisma.accountingPeriod.updateMany({
    where: { organisationId, fiscalYear },
    data: { status: PeriodStatus.LOCKED, closedBy: userId, closedAt: new Date() },
  });

  return { locked: periods.length };
}
