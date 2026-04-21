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

export type CreateBankAccountInput = z.infer<typeof createBankAccountSchema>;
export type ImportStatementInput = z.infer<typeof importStatementSchema>;
export type MatchLineInput = z.infer<typeof matchLineSchema>;
export type ListStatementsQuery = z.infer<typeof listStatementsSchema>;
