import { Prisma, EntryStatus, JournalType, PeriodStatus } from '@prisma/client';
import { prisma } from '../../config/database';
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
  UnbalancedEntryError,
  PeriodClosedError,
  AccountLockedError,
  ImmutableEntryError,
} from '../../utils/errors';
import type {
  CreateJournalInput,
  UpdateJournalInput,
  ListJournalsQuery,
  ApproveRejectInput,
  ReverseJournalInput,
} from './journal.schemas';
import { createJournalApprovalRequest } from '../approvals/approval.service';

// ─── Journal Number Generator ─────────────────────────────────────────────────

async function generateJournalNumber(
  organisationId: string,
  entryDate: Date,
  tx: Prisma.TransactionClient,
): Promise<string> {
  const year = entryDate.getUTCFullYear();
  const prefix = `JE-${year}-`;

  const last = await tx.journalEntry.findFirst({
    where: { organisationId, journalNumber: { startsWith: prefix } },
    orderBy: { journalNumber: 'desc' },
    select: { journalNumber: true },
  });

  const seq = last ? parseInt(last.journalNumber.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(5, '0')}`;
}

// ─── Balance Validation ───────────────────────────────────────────────────────

function assertBalanced(
  lines: Array<{ debitAmount: number; creditAmount: number; exchangeRate: number; currency?: string }>,
  baseCurrency: string,
): void {
  let totalDebit = new Prisma.Decimal(0);
  let totalCredit = new Prisma.Decimal(0);

  for (const line of lines) {
    const rate = new Prisma.Decimal(line.exchangeRate);
    const dr = new Prisma.Decimal(line.debitAmount).mul(rate);
    const cr = new Prisma.Decimal(line.creditAmount).mul(rate);
    totalDebit = totalDebit.add(dr);
    totalCredit = totalCredit.add(cr);
  }

  if (!totalDebit.equals(totalCredit)) {
    throw new UnbalancedEntryError(
      `Journal entry is not balanced: debits ${totalDebit.toFixed(4)} ≠ credits ${totalCredit.toFixed(4)} (base currency: ${baseCurrency})`,
    );
  }

  // Each line must debit OR credit — not both and not neither
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const hasDr = new Prisma.Decimal(line.debitAmount).greaterThan(0);
    const hasCr = new Prisma.Decimal(line.creditAmount).greaterThan(0);
    if (hasDr && hasCr) throw new ValidationError(`Line ${i + 1}: cannot have both debit and credit amounts`);
    if (!hasDr && !hasCr) throw new ValidationError(`Line ${i + 1}: must have either a debit or credit amount`);
  }
}

// ─── Period & Account Validators ─────────────────────────────────────────────

async function assertPeriodOpen(
  organisationId: string,
  periodId: string,
  tx: Prisma.TransactionClient,
) {
  const period = await tx.accountingPeriod.findFirst({
    where: { id: periodId, organisationId },
    select: { status: true, name: true },
  });
  if (!period) throw new NotFoundError('Accounting period not found');
  if (period.status !== PeriodStatus.OPEN) {
    throw new PeriodClosedError(`Period '${period.name}' is ${period.status.toLowerCase()} — cannot post entries`);
  }
  return period;
}

async function assertAccountsValid(
  organisationId: string,
  accountIds: string[],
  tx: Prisma.TransactionClient,
) {
  const unique = [...new Set(accountIds)];
  const accounts = await tx.account.findMany({
    where: { id: { in: unique }, organisationId, isDeleted: false },
    select: { id: true, isActive: true, isLocked: true, name: true, code: true },
  });

  const found = new Map(accounts.map((a) => [a.id, a]));
  for (const id of unique) {
    const acc = found.get(id);
    if (!acc) throw new NotFoundError(`Account ${id} not found in this organisation`);
    if (!acc.isActive) throw new ForbiddenError(`Account '${acc.code} ${acc.name}' is inactive`);
    if (acc.isLocked) throw new AccountLockedError(`Account '${acc.code} ${acc.name}' is locked`);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function findJournal(organisationId: string, journalId: string) {
  const entry = await prisma.journalEntry.findFirst({
    where: { id: journalId, organisationId },
    include: { lines: true },
  });
  if (!entry) throw new NotFoundError('Journal entry not found');
  return entry;
}

function assertEditable(status: EntryStatus) {
  if (status !== EntryStatus.DRAFT && status !== EntryStatus.REJECTED) {
    throw new ImmutableEntryError('Only DRAFT or REJECTED journal entries can be modified');
  }
}

function assertStatus(actual: EntryStatus, expected: EntryStatus, action: string) {
  if (actual !== expected) {
    throw new ForbiddenError(`Cannot ${action}: entry must be ${expected} (currently ${actual})`);
  }
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function createJournalEntry(
  organisationId: string,
  input: CreateJournalInput,
  userId: string,
) {
  const org = await prisma.organisation.findUnique({
    where: { id: organisationId },
    select: { baseCurrency: true },
  });
  if (!org) throw new NotFoundError('Organisation not found');

  assertBalanced(input.lines, org.baseCurrency);

  return prisma.$transaction(async (tx) => {
    const entryDate = new Date(input.entryDate + 'T00:00:00Z');

    await assertPeriodOpen(organisationId, input.periodId, tx);
    await assertAccountsValid(
      organisationId,
      input.lines.map((l) => l.accountId),
      tx,
    );

    const journalNumber = await generateJournalNumber(organisationId, entryDate, tx);

    const entry = await tx.journalEntry.create({
      data: {
        organisationId,
        journalNumber,
        type: input.type,
        reference: input.reference ?? null,
        description: input.description,
        entryDate,
        postingDate: entryDate,
        periodId: input.periodId,
        currency: input.currency,
        exchangeRate: new Prisma.Decimal(input.exchangeRate),
        status: EntryStatus.DRAFT,
        createdBy: userId,
        lines: {
          create: input.lines.map((line, idx) => {
            const rate = new Prisma.Decimal(line.exchangeRate ?? 1);
            return {
              lineNumber: idx + 1,
              accountId: line.accountId,
              description: line.description ?? null,
              debitAmount: new Prisma.Decimal(line.debitAmount),
              creditAmount: new Prisma.Decimal(line.creditAmount),
              currency: line.currency ?? input.currency,
              exchangeRate: rate,
              baseDebitAmount: new Prisma.Decimal(line.debitAmount).mul(rate),
              baseCreditAmount: new Prisma.Decimal(line.creditAmount).mul(rate),
              taxCode: line.taxCode ?? null,
              taxAmount: line.taxAmount != null ? new Prisma.Decimal(line.taxAmount) : null,
              costCentreId: line.costCentreId ?? null,
              departmentId: line.departmentId ?? null,
            };
          }),
        },
      },
      include: { lines: true },
    });

    return entry;
  });
}

export async function updateJournalEntry(
  organisationId: string,
  journalId: string,
  input: UpdateJournalInput,
  _userId: string,
) {
  const existing = await findJournal(organisationId, journalId);
  assertEditable(existing.status);

  const org = await prisma.organisation.findUnique({
    where: { id: organisationId },
    select: { baseCurrency: true },
  });
  if (!org) throw new NotFoundError('Organisation not found');

  if (input.lines) {
    assertBalanced(input.lines, org.baseCurrency);
  }

  return prisma.$transaction(async (tx) => {
    if (input.lines) {
      await assertAccountsValid(
        organisationId,
        input.lines.map((l) => l.accountId),
        tx,
      );
      // Replace lines: delete existing, recreate
      await tx.journalLine.deleteMany({ where: { journalEntryId: journalId } });
    }

    const entryDate = input.entryDate
      ? new Date(input.entryDate + 'T00:00:00Z')
      : undefined;

    return tx.journalEntry.update({
      where: { id: journalId },
      data: {
        reference: input.reference,
        description: input.description,
        entryDate,
        postingDate: entryDate,
        status: EntryStatus.DRAFT,
        ...(input.lines && {
          lines: {
            create: input.lines.map((line, idx) => {
              const rate = new Prisma.Decimal(line.exchangeRate ?? 1);
              return {
                lineNumber: idx + 1,
                accountId: line.accountId,
                description: line.description ?? null,
                debitAmount: new Prisma.Decimal(line.debitAmount),
                creditAmount: new Prisma.Decimal(line.creditAmount),
                currency: line.currency ?? existing.currency,
                exchangeRate: rate,
                baseDebitAmount: new Prisma.Decimal(line.debitAmount).mul(rate),
                baseCreditAmount: new Prisma.Decimal(line.creditAmount).mul(rate),
                taxCode: line.taxCode ?? null,
                taxAmount: line.taxAmount != null ? new Prisma.Decimal(line.taxAmount) : null,
                costCentreId: line.costCentreId ?? null,
                departmentId: line.departmentId ?? null,
              };
            }),
          },
        }),
      },
      include: { lines: true },
    });
  });
}

export async function deleteJournalEntry(organisationId: string, journalId: string) {
  const entry = await findJournal(organisationId, journalId);
  assertEditable(entry.status);
  // Lines cascade-delete via schema
  await prisma.journalEntry.delete({ where: { id: journalId } });
}

export async function getJournalEntry(organisationId: string, journalId: string) {
  const entry = await prisma.journalEntry.findFirst({
    where: { id: journalId, organisationId },
    include: {
      lines: {
        orderBy: { lineNumber: 'asc' },
        include: { account: { select: { code: true, name: true, class: true, type: true } } },
      },
      creator: { select: { id: true, firstName: true, lastName: true, email: true } },
      approver: { select: { id: true, firstName: true, lastName: true } },
      poster: { select: { id: true, firstName: true, lastName: true } },
      period: { select: { name: true, fiscalYear: true, periodNumber: true } },
    },
  });
  if (!entry) throw new NotFoundError('Journal entry not found');
  return entry;
}

export async function listJournalEntries(organisationId: string, query: ListJournalsQuery) {
  const where: Prisma.JournalEntryWhereInput = {
    organisationId,
    ...(query.status && { status: query.status }),
    ...(query.type && { type: query.type }),
    ...(query.periodId && { periodId: query.periodId }),
    ...(query.fromDate || query.toDate
      ? {
          entryDate: {
            ...(query.fromDate && { gte: new Date(query.fromDate + 'T00:00:00Z') }),
            ...(query.toDate && { lte: new Date(query.toDate + 'T00:00:00Z') }),
          },
        }
      : {}),
    ...(query.search && {
      OR: [
        { journalNumber: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
        { reference: { contains: query.search, mode: 'insensitive' } },
      ],
    }),
  };

  const [total, entries] = await Promise.all([
    prisma.journalEntry.count({ where }),
    prisma.journalEntry.findMany({
      where,
      orderBy: [{ entryDate: 'desc' }, { journalNumber: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        creator: { select: { firstName: true, lastName: true } },
        period: { select: { name: true } },
        _count: { select: { lines: true } },
      },
    }),
  ]);

  return { entries, total, page: query.page, pageSize: query.pageSize };
}

// ─── Lifecycle Transitions ────────────────────────────────────────────────────

export async function submitForApproval(
  organisationId: string,
  journalId: string,
  submittedBy: string,
) {
  const entry = await findJournal(organisationId, journalId);
  assertEditable(entry.status);

  // Re-validate balance before submission
  const org = await prisma.organisation.findUnique({
    where: { id: organisationId },
    select: { baseCurrency: true },
  });
  assertBalanced(
    entry.lines.map((l) => ({
      debitAmount: Number(l.debitAmount),
      creditAmount: Number(l.creditAmount),
      exchangeRate: Number(l.exchangeRate),
      currency: l.currency,
    })),
    org!.baseCurrency,
  );

  await prisma.journalEntry.update({
    where: { id: journalId },
    data: { status: EntryStatus.PENDING_APPROVAL },
  });

  // Wire into approval workflow if one is configured for this org
  const { requestId, hasWorkflow } = await createJournalApprovalRequest(
    organisationId,
    journalId,
    submittedBy,
  );

  return { journalId, status: EntryStatus.PENDING_APPROVAL, approvalRequestId: hasWorkflow ? requestId : null };
}

export async function approveJournalEntry(
  organisationId: string,
  journalId: string,
  userId: string,
  _input: ApproveRejectInput,
) {
  const entry = await findJournal(organisationId, journalId);
  assertStatus(entry.status, EntryStatus.PENDING_APPROVAL, 'approve');

  if (entry.createdBy === userId) {
    throw new ForbiddenError('Cannot approve your own journal entry (segregation of duties)');
  }

  return prisma.journalEntry.update({
    where: { id: journalId },
    data: {
      status: EntryStatus.APPROVED,
      approvedBy: userId,
      approvedAt: new Date(),
    },
  });
}

export async function rejectJournalEntry(
  organisationId: string,
  journalId: string,
  _rejectedBy: string,
  input: ApproveRejectInput,
) {
  const entry = await findJournal(organisationId, journalId);
  assertStatus(entry.status, EntryStatus.PENDING_APPROVAL, 'reject');

  return prisma.journalEntry.update({
    where: { id: journalId },
    data: {
      status: EntryStatus.DRAFT,
      description: input.comments
        ? `[REJECTED: ${input.comments}] ${entry.description}`
        : entry.description,
    },
  });
}

// ─── Post to Ledger ───────────────────────────────────────────────────────────

async function postToLedger(
  journalEntry: Awaited<ReturnType<typeof findJournal>>,
  tx: Prisma.TransactionClient,
) {
  const { organisationId, id: journalEntryId, periodId, postingDate, entryDate } = journalEntry;

  for (const line of journalEntry.lines) {
    // Get the current running balance for this account (last ledger entry by postingDate then id)
    const lastEntry = await tx.ledgerEntry.findFirst({
      where: { organisationId, accountId: line.accountId },
      orderBy: [{ postingDate: 'desc' }, { id: 'desc' }],
      select: { runningBalance: true },
    });

    const prev = lastEntry?.runningBalance ?? new Prisma.Decimal(0);
    const runningBalance = prev
      .add(new Prisma.Decimal(line.baseDebitAmount))
      .sub(new Prisma.Decimal(line.baseCreditAmount));

    await tx.ledgerEntry.create({
      data: {
        organisationId,
        accountId: line.accountId,
        journalEntryId,
        journalLineId: line.id,
        transactionDate: entryDate,
        postingDate,
        description: line.description,
        debitAmount: line.baseDebitAmount,
        creditAmount: line.baseCreditAmount,
        runningBalance,
        periodId,
      },
    });
  }
}

export async function postJournalEntry(
  organisationId: string,
  journalId: string,
  userId: string,
) {
  return prisma.$transaction(async (tx) => {
    const entry = await tx.journalEntry.findFirst({
      where: { id: journalId, organisationId },
      include: { lines: true },
    });
    if (!entry) throw new NotFoundError('Journal entry not found');

    assertStatus(entry.status, EntryStatus.APPROVED, 'post');
    await assertPeriodOpen(organisationId, entry.periodId, tx);

    // Final balance check
    const org = await tx.organisation.findUnique({
      where: { id: organisationId },
      select: { baseCurrency: true },
    });
    assertBalanced(
      entry.lines.map((l) => ({
        debitAmount: Number(l.debitAmount),
        creditAmount: Number(l.creditAmount),
        exchangeRate: Number(l.exchangeRate),
        currency: l.currency,
      })),
      org!.baseCurrency,
    );

    await postToLedger(entry, tx);

    return tx.journalEntry.update({
      where: { id: journalId },
      data: {
        status: EntryStatus.POSTED,
        postedBy: userId,
        postedAt: new Date(),
      },
      include: { lines: true },
    });
  });
}

// ─── Reversal ─────────────────────────────────────────────────────────────────

export async function reverseJournalEntry(
  organisationId: string,
  journalId: string,
  userId: string,
  input: ReverseJournalInput,
) {
  const original = await findJournal(organisationId, journalId);

  if (original.status !== EntryStatus.POSTED) {
    throw new ForbiddenError('Only POSTED entries can be reversed');
  }
  if (original.reversedByEntryId) {
    throw new ConflictError('This entry has already been reversed');
  }

  const org = await prisma.organisation.findUnique({
    where: { id: organisationId },
    select: { baseCurrency: true },
  });
  if (!org) throw new NotFoundError('Organisation not found');

  return prisma.$transaction(async (tx) => {
    const reverseDate = new Date(input.reverseDate + 'T00:00:00Z');

    await assertPeriodOpen(organisationId, input.periodId, tx);

    const journalNumber = await generateJournalNumber(organisationId, reverseDate, tx);

    const description = input.description ?? `Reversal of ${original.journalNumber}: ${original.description}`;

    const reversal = await tx.journalEntry.create({
      data: {
        organisationId,
        journalNumber,
        type: JournalType.REVERSAL,
        reference: original.reference ?? null,
        description,
        entryDate: reverseDate,
        postingDate: reverseDate,
        periodId: input.periodId,
        currency: original.currency,
        exchangeRate: original.exchangeRate,
        status: EntryStatus.APPROVED,
        createdBy: userId,
        approvedBy: userId,
        approvedAt: new Date(),
        reversedByEntryId: journalId,
        lines: {
          create: original.lines.map((line, idx) => ({
            lineNumber: idx + 1,
            accountId: line.accountId,
            description: `Reversal: ${line.description ?? ''}`.trim(),
            // Swap debit ↔ credit
            debitAmount: line.creditAmount,
            creditAmount: line.debitAmount,
            currency: line.currency,
            exchangeRate: line.exchangeRate,
            baseDebitAmount: line.baseCreditAmount,
            baseCreditAmount: line.baseDebitAmount,
            taxCode: line.taxCode,
            taxAmount: line.taxAmount,
            costCentreId: line.costCentreId,
            departmentId: line.departmentId,
          })),
        },
      },
      include: { lines: true },
    });

    // Mark original as reversed
    await tx.journalEntry.update({
      where: { id: journalId },
      data: { status: EntryStatus.REVERSED },
    });

    // Post reversal to ledger immediately (it's auto-approved)
    const reversalWithLines = await tx.journalEntry.findFirst({
      where: { id: reversal.id },
      include: { lines: true },
    });
    await postToLedger(reversalWithLines!, tx);

    // Set reversal to POSTED
    return tx.journalEntry.update({
      where: { id: reversal.id },
      data: { status: EntryStatus.POSTED, postedBy: userId, postedAt: new Date() },
      include: { lines: true },
    });
  });
}
