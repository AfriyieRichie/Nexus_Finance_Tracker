import { z } from 'zod';
import { AccountClass, AccountType } from '@prisma/client';

export const createAccountSchema = z.object({
  code: z
    .string()
    .min(1)
    .max(20)
    .trim()
    .regex(/^[0-9A-Za-z.\-]+$/, 'Account code may only contain letters, numbers, dots, or hyphens'),
  name: z.string().min(1).max(200).trim(),
  description: z.string().max(500).trim().optional(),
  class: z.nativeEnum(AccountClass),
  subClass: z.string().max(100).trim().optional(),
  type: z.nativeEnum(AccountType),
  parentId: z.string().uuid().optional().nullable(),
  isControlAccount: z.boolean().default(false),
  isBankAccount: z.boolean().default(false),
  currency: z.string().length(3).toUpperCase().optional().nullable(),
  taxRate: z.number().min(0).max(100).optional().nullable(),
});

export const updateAccountSchema = createAccountSchema
  .omit({ code: true, class: true })
  .partial()
  .extend({
    isActive: z.boolean().optional(),
    isLocked: z.boolean().optional(),
  });

export const listAccountsSchema = z.object({
  class: z.nativeEnum(AccountClass).optional(),
  type: z.nativeEnum(AccountType).optional(),
  parentId: z.string().uuid().optional().nullable(),
  isActive: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  isControlAccount: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  search: z.string().max(100).optional(),
  page: z
    .string()
    .default('1')
    .transform((v) => Math.max(1, parseInt(v, 10))),
  pageSize: z
    .string()
    .default('100')
    .transform((v) => Math.min(500, Math.max(1, parseInt(v, 10)))),
});

export const importTemplateSchema = z.object({
  templateName: z.enum([
    'agriculture',
    'retail',
    'services',
    'technology',
    'manufacturing',
    'healthcare',
    'real-estate',
    'hospitality',
    'non-profit',
    'financial-services',
  ]),
});

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
export type ListAccountsQuery = z.infer<typeof listAccountsSchema>;
export type ImportTemplateInput = z.infer<typeof importTemplateSchema>;
