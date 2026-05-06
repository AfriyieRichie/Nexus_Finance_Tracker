import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { ConflictError, NotFoundError, ValidationError } from '../../utils/errors';
import * as journalService from '../journals/journal.service';
import type {
  CreateBankAccountInput, ImportStatementInput, MatchLineInput, ListStatementsQuery,
  ConfirmReconciliationInput, CreateJournalFromLineInput,
  UnlockReconciliationInput, GetUnmatchedEntriesQuery,
} from './bank.schemas';

export async function createBankAccount(organisationId: string, input: CreateBankAccountInput) {
  const account = await prisma.account.findFirst({
    where: { id: input.accountId, organisationId, isDeleted: false },
  });
  if (!account) throw new NotFoundError('Ledger account not found');

  const existing = await prisma.bankAccount.findUnique({ where: { accountId: input.accountId } });
  if (existing) throw new ConflictError('This ledger account is already linked to a bank account');

  return prisma.bankAccount.create({
    data: {
      organisationId,
      accountId: input.accountId,
      bankName: input.bankName,
      accountNumber: input.accountNumber,
      branchCode: input.branchCode,
      currency: input.currency,
    },
    include: { account: { select: { code: true, name: true } } },
  });
}

export async function listBankAccounts(organisationId: string) {
  return prisma.bankAccount.findMany({
    where: { organisationId, isActive: true },
    include: { account: { select: { code: true, name: true } } },
    orderBy: { bankName: 'asc' },
  });
}

export async function importStatement(organisationId: string, input: ImportStatementInput) {
  const bankAccount = await prisma.bankAccount.findFirst({
    where: { id: input.bankAccountId, organisationId },
  });
  if (!bankAccount) throw new NotFoundError('Bank account not found');

  const existing = await prisma.bankStatement.findFirst({
    where: { bankAccountId: input.bankAccountId, statementDate: new Date(input.statementDate) },
  });
  if (existing) throw new ConflictError('A statement for this date already exists for this account');

  return prisma.bankStatement.create({
    data: {
      bankAccountId: input.bankAccountId,
      statementDate: new Date(input.statementDate),
      openingBalance: new Prisma.Decimal(input.openingBalance),
      closingBalance: new Prisma.Decimal(input.closingBalance),
      lines: {
        create: input.lines.map((l) => ({
          transactionDate: new Date(l.transactionDate),
          description: l.description,
          debitAmount: new Prisma.Decimal(l.debitAmount),
          creditAmount: new Prisma.Decimal(l.creditAmount),
          reference: l.reference,
        })),
      },
    },
    include: { lines: true },
  });
}

export async function listStatements(organisationId: string, query: ListStatementsQuery) {
  const bankAccountIds = query.bankAccountId
    ? [query.bankAccountId]
    : (await prisma.bankAccount.findMany({ where: { organisationId }, select: { id: true } })).map((b) => b.id);

  const where = { bankAccountId: { in: bankAccountIds } };

  const [total, statements] = await Promise.all([
    prisma.bankStatement.count({ where }),
    prisma.bankStatement.findMany({
      where,
      include: {
        bankAccount: { select: { bankName: true, accountNumber: true } },
        _count: { select: { lines: true } },
      },
      orderBy: { statementDate: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return { statements, total, page: query.page, pageSize: query.pageSize };
}

export async function getStatement(organisationId: string, statementId: string) {
  const stmt = await prisma.bankStatement.findFirst({
    where: { id: statementId, bankAccount: { organisationId } },
    include: {
      bankAccount: { select: { bankName: true, accountNumber: true, currency: true } },
      lines: { orderBy: { transactionDate: 'asc' } },
    },
  });
  if (!stmt) throw new NotFoundError('Statement not found');
  return stmt;
}

export async function matchLine(organisationId: string, input: MatchLineInput) {
  const line = await prisma.bankStatementLine.findFirst({
    where: { id: input.statementLineId, statement: { bankAccount: { organisationId } } },
    include: { statement: { select: { isLocked: true } } },
  });
  if (!line) throw new NotFoundError('Statement line not found');
  if (line.isMatched) throw new ConflictError('This line is already matched');
  if (line.statement.isLocked) throw new ValidationError('Statement is locked — cannot modify a confirmed reconciliation');

  const ledgerEntry = await prisma.ledgerEntry.findFirst({
    where: { id: input.ledgerEntryId, organisationId },
  });
  if (!ledgerEntry) throw new NotFoundError('Ledger entry not found');

  return prisma.bankStatementLine.update({
    where: { id: input.statementLineId },
    data: { isMatched: true, matchedEntryId: input.ledgerEntryId },
  });
}

export async function unmatchLine(organisationId: string, lineId: string) {
  const line = await prisma.bankStatementLine.findFirst({
    where: { id: lineId, statement: { bankAccount: { organisationId } } },
    include: { statement: { select: { isLocked: true } } },
  });
  if (!line) throw new NotFoundError('Statement line not found');
  if (line.statement.isLocked) throw new ValidationError('Statement is locked — cannot modify a confirmed reconciliation');

  return prisma.bankStatementLine.update({
    where: { id: lineId },
    data: { isMatched: false, matchedEntryId: null, matchNote: null, journalEntryId: null },
  });
}

export async function autoMatch(organisationId: string, statementId: string) {
  const stmt = await prisma.bankStatement.findFirst({
    where: { id: statementId, bankAccount: { organisationId } },
    include: { lines: { where: { isMatched: false } }, bankAccount: true },
  });
  if (!stmt) throw new NotFoundError('Statement not found');
  if (stmt.isLocked) throw new ValidationError('Statement is locked');

  let matched = 0;

  for (const line of stmt.lines) {
    const amount = line.creditAmount.greaterThan(0) ? line.creditAmount : line.debitAmount;
    const isCredit = line.creditAmount.greaterThan(0);

    const entry = await prisma.ledgerEntry.findFirst({
      where: {
        organisationId,
        accountId: stmt.bankAccount.accountId,
        transactionDate: line.transactionDate,
        ...(isCredit ? { creditAmount: amount } : { debitAmount: amount }),
      },
    });

    if (entry) {
      await prisma.bankStatementLine.update({
        where: { id: line.id },
        data: { isMatched: true, matchedEntryId: entry.id },
      });
      matched++;
    }
  }

  return { matched, unmatched: stmt.lines.length - matched };
}

export async function getReconciliationSummary(organisationId: string, statementId: string) {
  const stmt = await prisma.bankStatement.findFirst({
    where: { id: statementId, bankAccount: { organisationId } },
    include: {
      lines: true,
      bankAccount: { include: { account: { select: { code: true, name: true } } } },
    },
  });
  if (!stmt) throw new NotFoundError('Statement not found');

  const totalLines = stmt.lines.length;
  const matchedLines = stmt.lines.filter((l) => l.isMatched).length;
  const unmatchedLines = stmt.lines.filter((l) => !l.isMatched);

  const unmatchedDebits = unmatchedLines.reduce((s, l) => s.plus(l.debitAmount), new Prisma.Decimal(0));
  const unmatchedCredits = unmatchedLines.reduce((s, l) => s.plus(l.creditAmount), new Prisma.Decimal(0));

  return {
    statementId,
    bankAccount: stmt.bankAccount,
    statementDate: stmt.statementDate,
    openingBalance: stmt.openingBalance.toFixed(2),
    closingBalance: stmt.closingBalance.toFixed(2),
    isReconciled: stmt.isReconciled,
    isLocked: stmt.isLocked,
    reconciledAt: stmt.reconciledAt,
    reconciledBy: stmt.reconciledBy,
    totalLines,
    matchedLines,
    unmatchedLines: unmatchedLines.length,
    unmatchedDebits: unmatchedDebits.toFixed(2),
    unmatchedCredits: unmatchedCredits.toFixed(2),
    difference: stmt.closingBalance.minus(stmt.openingBalance).toFixed(2),
  };
}

// ─── Confirm & Lock ───────────────────────────────────────────────────────────

export async function confirmReconciliation(
  organisationId: string,
  statementId: string,
  userId: string,
  input: ConfirmReconciliationInput,
) {
  const stmt = await prisma.bankStatement.findFirst({
    where: { id: statementId, bankAccount: { organisationId } },
    include: { lines: { where: { isMatched: true } } },
  });
  if (!stmt) throw new NotFoundError('Statement not found');
  if (stmt.isLocked) throw new ConflictError('This reconciliation is already confirmed and locked');

  // Segregation of duties: the confirming user must not have posted any matched transactions
  if (!input.force) {
    const matchedJournalEntryIds = stmt.lines
      .map((l) => l.journalEntryId ?? l.matchedEntryId)
      .filter(Boolean) as string[];

    if (matchedJournalEntryIds.length > 0) {
      const conflict = await prisma.journalEntry.findFirst({
        where: {
          id: { in: matchedJournalEntryIds },
          OR: [{ createdBy: userId }, { postedBy: userId }],
        },
        select: { journalNumber: true },
      });
      if (conflict) {
        throw new ValidationError(
          `SEGREGATION_VIOLATION:You posted journal ${conflict.journalNumber} which is matched in this reconciliation. A different user must confirm. Pass force=true to override (supervisor only).`,
        );
      }
    }
  }

  return prisma.bankStatement.update({
    where: { id: statementId },
    data: {
      isReconciled: true,
      isLocked: true,
      reconciledAt: new Date(),
      reconciledBy: userId,
    },
  });
}

// ─── Create Journal from Unmatched Line ──────────────────────────────────────

export async function createJournalFromLine(
  organisationId: string,
  lineId: string,
  userId: string,
  input: CreateJournalFromLineInput,
) {
  const line = await prisma.bankStatementLine.findFirst({
    where: { id: lineId, statement: { bankAccount: { organisationId } } },
    include: { statement: { include: { bankAccount: true } } },
  });
  if (!line) throw new NotFoundError('Statement line not found');
  if (line.isMatched) throw new ConflictError('This line is already matched');
  if (line.statement.isLocked) throw new ValidationError('Statement is locked');

  const org = await prisma.organisation.findUnique({
    where: { id: organisationId },
    select: { baseCurrency: true },
  });
  const currency = org?.baseCurrency ?? 'USD';

  const bankAccountId = line.statement.bankAccount.accountId;
  const isDebit = line.debitAmount.greaterThan(0);
  const amount = isDebit ? line.debitAmount : line.creditAmount;
  const entryDate = line.transactionDate.toISOString().split('T')[0];

  // Debit on statement = money out of bank = credit bank, debit expense/other account
  // Credit on statement = money into bank = debit bank, credit income/other account
  const lines = isDebit
    ? [
        { accountId: input.accountId, debitAmount: Number(amount), creditAmount: 0, description: line.description, currency, exchangeRate: 1 },
        { accountId: bankAccountId, debitAmount: 0, creditAmount: Number(amount), description: line.description, currency, exchangeRate: 1 },
      ]
    : [
        { accountId: bankAccountId, debitAmount: Number(amount), creditAmount: 0, description: line.description, currency, exchangeRate: 1 },
        { accountId: input.accountId, debitAmount: 0, creditAmount: Number(amount), description: line.description, currency, exchangeRate: 1 },
      ];

  const je = await journalService.createAndPostSystemEntry(
    organisationId,
    { type: 'BANK', description: input.description, entryDate, periodId: input.periodId, currency, exchangeRate: 1, lines },
    userId,
  );

  // Find the ledger entry for the bank account leg to use as matchedEntryId
  const ledgerEntry = await prisma.ledgerEntry.findFirst({
    where: { journalEntryId: je.id, accountId: bankAccountId },
  });

  await prisma.bankStatementLine.update({
    where: { id: lineId },
    data: {
      isMatched: true,
      matchedEntryId: ledgerEntry?.id,
      matchNote: input.note,
      journalEntryId: je.id,
    },
  });

  return { journalEntryId: je.id, journalNumber: je.journalNumber };
}

// ─── Phase 2: Manual Match — Unmatched Ledger Entries ────────────────────────

export async function getUnmatchedLedgerEntries(
  organisationId: string,
  bankAccountId: string,
  query: GetUnmatchedEntriesQuery,
) {
  const bankAccount = await prisma.bankAccount.findFirst({
    where: { id: bankAccountId, organisationId },
  });
  if (!bankAccount) throw new NotFoundError('Bank account not found');

  // IDs already matched to any bank statement line
  const matched = await prisma.bankStatementLine.findMany({
    where: { matchedEntryId: { not: null }, statement: { bankAccount: { organisationId } } },
    select: { matchedEntryId: true },
  });
  const matchedIds = matched.map((l) => l.matchedEntryId).filter(Boolean) as string[];

  const where: Prisma.LedgerEntryWhereInput = {
    organisationId,
    accountId: bankAccount.accountId,
    id: matchedIds.length > 0 ? { notIn: matchedIds } : undefined,
  };

  if (query.dateFrom) where.transactionDate = { ...(where.transactionDate as object), gte: new Date(query.dateFrom) };
  if (query.dateTo) where.transactionDate = { ...(where.transactionDate as object), lte: new Date(query.dateTo) };
  if (query.amount) {
    const dec = new Prisma.Decimal(query.amount);
    where.OR = [{ debitAmount: dec }, { creditAmount: dec }];
  }

  return prisma.ledgerEntry.findMany({
    where,
    include: { journalEntry: { select: { journalNumber: true, type: true, description: true } } },
    orderBy: { transactionDate: 'desc' },
    take: query.take,
  });
}

// ─── Phase 2: Unlock Reconciliation ──────────────────────────────────────────

export async function unlockReconciliation(
  organisationId: string,
  statementId: string,
  _userId: string,
  input: UnlockReconciliationInput,
) {
  void input.reason; // stored in audit log in future; acknowledged here
  const stmt = await prisma.bankStatement.findFirst({
    where: { id: statementId, bankAccount: { organisationId } },
  });
  if (!stmt) throw new NotFoundError('Statement not found');
  if (!stmt.isLocked) throw new ValidationError('Statement is not locked');

  return prisma.bankStatement.update({
    where: { id: statementId },
    data: { isLocked: false, isReconciled: false, reconciledAt: null, reconciledBy: null },
  });
}

// ─── Phase 3: Reconciliation Report ──────────────────────────────────────────

export async function getReconciliationReport(organisationId: string, statementId: string) {
  const stmt = await prisma.bankStatement.findFirst({
    where: { id: statementId, bankAccount: { organisationId } },
    include: {
      bankAccount: { include: { account: { select: { code: true, name: true } } } },
      lines: { select: { matchedEntryId: true, isMatched: true } },
    },
  });
  if (!stmt) throw new NotFoundError('Statement not found');

  const accountId = stmt.bankAccount.accountId;
  const asAt = stmt.statementDate;

  // GL balance for the bank account as at statement date (debit − credit = net asset balance)
  const agg = await prisma.ledgerEntry.aggregate({
    where: { organisationId, accountId, transactionDate: { lte: asAt } },
    _sum: { debitAmount: true, creditAmount: true },
  });
  const glDebits = agg._sum.debitAmount ?? new Prisma.Decimal(0);
  const glCredits = agg._sum.creditAmount ?? new Prisma.Decimal(0);
  const glBalance = glDebits.minus(glCredits);

  // Outstanding GL items: entries for the bank account NOT matched to any statement line, dated ≤ statement date
  const allMatchedIds = stmt.lines.map((l) => l.matchedEntryId).filter(Boolean) as string[];
  const outstandingEntries = await prisma.ledgerEntry.findMany({
    where: {
      organisationId,
      accountId,
      transactionDate: { lte: asAt },
      id: allMatchedIds.length > 0 ? { notIn: allMatchedIds } : undefined,
    },
    include: { journalEntry: { select: { journalNumber: true } } },
    orderBy: { transactionDate: 'asc' },
  });

  // Deposits in transit: GL debit entries not yet on bank statement (money in, not cleared)
  const depositsInTransit = outstandingEntries.filter((e) => e.debitAmount.greaterThan(0));
  const totalDepositsInTransit = depositsInTransit.reduce((s, e) => s.plus(e.debitAmount), new Prisma.Decimal(0));

  // Outstanding payments: GL credit entries not yet on bank statement (payments issued, not cleared)
  const outstandingPayments = outstandingEntries.filter((e) => e.creditAmount.greaterThan(0));
  const totalOutstandingPayments = outstandingPayments.reduce((s, e) => s.plus(e.creditAmount), new Prisma.Decimal(0));

  const adjustedBankBalance = stmt.closingBalance.plus(totalDepositsInTransit).minus(totalOutstandingPayments);
  const difference = adjustedBankBalance.minus(glBalance);

  return {
    bankAccount: { ...stmt.bankAccount },
    statementDate: stmt.statementDate,
    statementId: stmt.id,
    isReconciled: stmt.isReconciled,
    isLocked: stmt.isLocked,
    reconciledAt: stmt.reconciledAt,
    reconciledBy: stmt.reconciledBy,
    // Bank side
    bankStatementBalance: stmt.closingBalance.toFixed(2),
    depositsInTransit: depositsInTransit.map((e) => ({
      date: e.transactionDate,
      description: e.description,
      amount: e.debitAmount.toFixed(2),
      journalNumber: e.journalEntry.journalNumber,
    })),
    totalDepositsInTransit: totalDepositsInTransit.toFixed(2),
    outstandingPayments: outstandingPayments.map((e) => ({
      date: e.transactionDate,
      description: e.description,
      amount: e.creditAmount.toFixed(2),
      journalNumber: e.journalEntry.journalNumber,
    })),
    totalOutstandingPayments: totalOutstandingPayments.toFixed(2),
    adjustedBankBalance: adjustedBankBalance.toFixed(2),
    // Book side
    glBalance: glBalance.toFixed(2),
    // Verdict
    difference: difference.toFixed(2),
    isBalanced: difference.equals(0),
  };
}
