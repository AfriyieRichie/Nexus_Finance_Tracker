import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { ConflictError, NotFoundError } from '../../utils/errors';
import type {
  CreateBankAccountInput, ImportStatementInput, MatchLineInput, ListStatementsQuery,
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

  // Check for duplicate statement date
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
  });
  if (!line) throw new NotFoundError('Statement line not found');
  if (line.isMatched) throw new ConflictError('This line is already matched');

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
  });
  if (!line) throw new NotFoundError('Statement line not found');

  return prisma.bankStatementLine.update({
    where: { id: lineId },
    data: { isMatched: false, matchedEntryId: null },
  });
}

export async function autoMatch(organisationId: string, statementId: string) {
  const stmt = await prisma.bankStatement.findFirst({
    where: { id: statementId, bankAccount: { organisationId } },
    include: { lines: { where: { isMatched: false } }, bankAccount: true },
  });
  if (!stmt) throw new NotFoundError('Statement not found');

  let matched = 0;

  for (const line of stmt.lines) {
    const amount = line.creditAmount.greaterThan(0) ? line.creditAmount : line.debitAmount;
    const isCredit = line.creditAmount.greaterThan(0);

    const entry = await prisma.ledgerEntry.findFirst({
      where: {
        organisationId,
        accountId: stmt.bankAccount.accountId,
        transactionDate: line.transactionDate,
        ...(isCredit
          ? { creditAmount: amount }
          : { debitAmount: amount }),
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
    totalLines,
    matchedLines,
    unmatchedLines: unmatchedLines.length,
    unmatchedDebits: unmatchedDebits.toFixed(2),
    unmatchedCredits: unmatchedCredits.toFixed(2),
    difference: stmt.closingBalance.minus(stmt.openingBalance).toFixed(2),
  };
}
