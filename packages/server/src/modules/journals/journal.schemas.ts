import { z } from 'zod';
import { JournalType, EntryStatus } from '@prisma/client';

const journalLineSchema = z.object({
  accountId: z.string().uuid(),
  description: z.string().max(500).trim().optional(),
  debitAmount: z.number().min(0).default(0),
  creditAmount: z.number().min(0).default(0),
  currency: z.string().length(3).toUpperCase().optional(),
  exchangeRate: z.number().positive().default(1),
  taxCode: z.string().max(20).optional(),
  taxAmount: z.number().min(0).optional(),
  costCentreId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
});

export const createJournalSchema = z.object({
  type: z.nativeEnum(JournalType).default(JournalType.GENERAL),
  reference: z.string().max(100).trim().optional(),
  description: z.string().min(1).max(500).trim(),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'entryDate must be YYYY-MM-DD'),
  periodId: z.string().uuid(),
  currency: z.string().length(3).toUpperCase(),
  exchangeRate: z.number().positive().default(1),
  lines: z
    .array(journalLineSchema)
    .min(2, 'A journal entry must have at least two lines')
    .max(500),
});

export const updateJournalSchema = z.object({
  reference: z.string().max(100).trim().optional(),
  description: z.string().min(1).max(500).trim().optional(),
  entryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'entryDate must be YYYY-MM-DD')
    .optional(),
  lines: z
    .array(journalLineSchema)
    .min(2, 'A journal entry must have at least two lines')
    .max(500)
    .optional(),
});

export const listJournalsSchema = z.object({
  status: z.nativeEnum(EntryStatus).optional(),
  type: z.nativeEnum(JournalType).optional(),
  periodId: z.string().uuid().optional(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  search: z.string().max(100).optional(),
  page: z
    .string()
    .default('1')
    .transform((v) => Math.max(1, parseInt(v, 10))),
  pageSize: z
    .string()
    .default('50')
    .transform((v) => Math.min(200, Math.max(1, parseInt(v, 10)))),
});

export const approveRejectSchema = z.object({
  comments: z.string().max(500).trim().optional(),
});

export const reverseJournalSchema = z.object({
  reverseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'reverseDate must be YYYY-MM-DD'),
  periodId: z.string().uuid(),
  description: z.string().max(500).trim().optional(),
});

export type CreateJournalInput = z.infer<typeof createJournalSchema>;
export type UpdateJournalInput = z.infer<typeof updateJournalSchema>;
export type ListJournalsQuery = z.infer<typeof listJournalsSchema>;
export type ApproveRejectInput = z.infer<typeof approveRejectSchema>;
export type ReverseJournalInput = z.infer<typeof reverseJournalSchema>;
