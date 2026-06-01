import { z } from 'zod';

export const createBankAccountSchema = z.object({
  accountId: z.string().uuid(),
  bankName: z.string().min(1),
  accountNumber: z.string().min(1),
  branchCode: z.string().optional(),
  currency: z.string().length(3),
});

export const importStatementSchema = z.object({
  bankAccountId: z.string().uuid(),
  statementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  openingBalance: z.number(),
  closingBalance: z.number(),
  lines: z.array(z.object({
    transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    description: z.string(),
    debitAmount: z.number().nonnegative().default(0),
    creditAmount: z.number().nonnegative().default(0),
    reference: z.string().optional(),
  })).min(1),
  skipContinuityCheck: z.boolean().default(false),
});

export const matchLineSchema = z.object({
  statementLineId: z.string().uuid(),
  ledgerEntryId: z.string().uuid(),
});

export const listStatementsSchema = z.object({
  bankAccountId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().default(20),
});

export const autoMatchSchema = z.object({
  windowDays: z.coerce.number().int().min(0).max(10).default(3),
  amountTolerance: z.coerce.number().min(0).max(10).default(0.01),
});

export const confirmReconciliationSchema = z.object({
  force: z.boolean().default(false),
  allowImbalance: z.boolean().default(false),
});

export const createJournalFromLineSchema = z.object({
  accountId: z.string().uuid(),
  periodId: z.string().uuid(),
  description: z.string().min(1).max(200),
  note: z.string().optional(),
});

export const unlockReconciliationSchema = z.object({
  reason: z.string().min(1).max(500),
});

export const getUnmatchedEntriesSchema = z.object({
  amount: z.coerce.number().positive().optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  take: z.coerce.number().int().positive().max(200).default(100),
});

export type CreateBankAccountInput = z.infer<typeof createBankAccountSchema>;
export type ImportStatementInput = z.infer<typeof importStatementSchema>;
export type MatchLineInput = z.infer<typeof matchLineSchema>;
export type ListStatementsQuery = z.infer<typeof listStatementsSchema>;
export type AutoMatchInput = z.infer<typeof autoMatchSchema>;
export type ConfirmReconciliationInput = z.infer<typeof confirmReconciliationSchema>;
export type CreateJournalFromLineInput = z.infer<typeof createJournalFromLineSchema>;
export type UnlockReconciliationInput = z.infer<typeof unlockReconciliationSchema>;
export type GetUnmatchedEntriesQuery = z.infer<typeof getUnmatchedEntriesSchema>;
