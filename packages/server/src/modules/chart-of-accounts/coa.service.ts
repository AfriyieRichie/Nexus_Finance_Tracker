import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  ForbiddenError,
} from '../../utils/errors';
import type {
  CreateAccountInput,
  UpdateAccountInput,
  ListAccountsQuery,
  ImportTemplateInput,
} from './coa.schemas';
import type { AccountNode, CoaTemplate } from './coa.types';
import { getTemplate } from './templates';

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildTree(flat: AccountNode[]): AccountNode[] {
  const map = new Map<string, AccountNode>();
  for (const node of flat) map.set(node.id, node);

  const roots: AccountNode[] = [];
  for (const node of flat) {
    if (node.parentId === null) {
      roots.push(node);
    } else {
      const parent = map.get(node.parentId);
      if (parent) parent.children.push(node);
    }
  }
  return roots;
}

async function assertNoLedgerEntries(accountId: string): Promise<void> {
  const count = await prisma.ledgerEntry.count({ where: { accountId } });
  if (count > 0) {
    throw new ForbiddenError('Cannot modify account that has posted ledger entries');
  }
}

async function resolveLevel(organisationId: string, parentId?: string | null): Promise<number> {
  if (!parentId) return 1;
  const parent = await prisma.account.findFirst({
    where: { id: parentId, organisationId, isDeleted: false },
    select: { level: true },
  });
  if (!parent) throw new NotFoundError('Parent account not found');
  if (parent.level >= 5) throw new ValidationError('Account hierarchy cannot exceed 5 levels');
  return parent.level + 1;
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function createAccount(organisationId: string, input: CreateAccountInput) {
  const existing = await prisma.account.findFirst({
    where: { organisationId, code: input.code, isDeleted: false },
  });
  if (existing) throw new ConflictError(`Account code '${input.code}' already exists`);

  const level = await resolveLevel(organisationId, input.parentId);

  return prisma.account.create({
    data: {
      organisationId,
      code: input.code,
      name: input.name,
      description: input.description,
      class: input.class,
      subClass: input.subClass,
      type: input.type,
      parentId: input.parentId ?? null,
      isControlAccount: input.isControlAccount,
      isBankAccount: input.isBankAccount,
      currency: input.currency ?? null,
      taxRate: input.taxRate != null ? new Prisma.Decimal(input.taxRate) : null,
      level,
    },
  });
}

export async function updateAccount(
  organisationId: string,
  accountId: string,
  input: UpdateAccountInput,
) {
  const account = await prisma.account.findFirst({
    where: { id: accountId, organisationId, isDeleted: false },
  });
  if (!account) throw new NotFoundError('Account not found');
  if (account.isLocked && !input.isActive) {
    throw new ForbiddenError('Account is locked and cannot be modified');
  }

  // Block name/type changes on accounts with ledger entries unless only toggling active/locked
  const safeOnlyFields = new Set(['isActive', 'isLocked']);
  const changingStructural = Object.keys(input).some((k) => !safeOnlyFields.has(k));
  if (changingStructural) {
    await assertNoLedgerEntries(accountId);
  }

  return prisma.account.update({
    where: { id: accountId },
    data: {
      name: input.name,
      description: input.description,
      subClass: input.subClass,
      type: input.type,
      parentId: input.parentId,
      isControlAccount: input.isControlAccount,
      isBankAccount: input.isBankAccount,
      currency: input.currency,
      taxRate: input.taxRate != null ? new Prisma.Decimal(input.taxRate) : undefined,
      isActive: input.isActive,
      isLocked: input.isLocked,
    },
  });
}

export async function softDeleteAccount(organisationId: string, accountId: string) {
  const account = await prisma.account.findFirst({
    where: { id: accountId, organisationId, isDeleted: false },
  });
  if (!account) throw new NotFoundError('Account not found');
  if (account.isLocked) throw new ForbiddenError('Locked accounts cannot be deleted');

  await assertNoLedgerEntries(accountId);

  const childCount = await prisma.account.count({
    where: { parentId: accountId, isDeleted: false },
  });
  if (childCount > 0) {
    throw new ForbiddenError('Cannot delete account with active child accounts');
  }

  return prisma.account.update({
    where: { id: accountId },
    data: { isDeleted: true, isActive: false },
  });
}

export async function getAccount(organisationId: string, accountId: string) {
  const account = await prisma.account.findFirst({
    where: { id: accountId, organisationId, isDeleted: false },
  });
  if (!account) throw new NotFoundError('Account not found');
  return account;
}

export async function listAccounts(organisationId: string, query: ListAccountsQuery) {
  const where: Prisma.AccountWhereInput = {
    organisationId,
    isDeleted: false,
    ...(query.class && { class: query.class }),
    ...(query.type && { type: query.type }),
    ...(query.isActive !== undefined && { isActive: query.isActive }),
    ...(query.isControlAccount !== undefined && { isControlAccount: query.isControlAccount }),
    ...(query.parentId !== undefined && { parentId: query.parentId }),
    ...(query.search && {
      OR: [
        { name: { contains: query.search, mode: 'insensitive' } },
        { code: { contains: query.search, mode: 'insensitive' } },
      ],
    }),
  };

  const [total, accounts] = await Promise.all([
    prisma.account.count({ where }),
    prisma.account.findMany({
      where,
      orderBy: [{ code: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return { accounts, total, page: query.page, pageSize: query.pageSize };
}

// ─── Hierarchy Tree ──────────────────────────────────────────────────────────

export async function getAccountHierarchy(organisationId: string): Promise<AccountNode[]> {
  const accounts = await prisma.account.findMany({
    where: { organisationId, isDeleted: false },
    orderBy: { code: 'asc' },
    select: {
      id: true,
      code: true,
      name: true,
      class: true,
      subClass: true,
      type: true,
      parentId: true,
      isControlAccount: true,
      isBankAccount: true,
      isActive: true,
      isLocked: true,
      level: true,
    },
  });

  const nodes: AccountNode[] = accounts.map((a) => ({
    ...a,
    subClass: a.subClass ?? null,
    children: [],
  }));

  return buildTree(nodes);
}

// ─── Template Import ─────────────────────────────────────────────────────────

export async function importTemplate(
  organisationId: string,
  input: ImportTemplateInput,
): Promise<{ imported: number }> {
  const existing = await prisma.account.count({
    where: { organisationId, isDeleted: false },
  });
  if (existing > 0) {
    throw new ConflictError(
      'Organisation already has accounts. Template import is only allowed on a fresh chart of accounts.',
    );
  }

  const template: CoaTemplate = getTemplate(input.templateName);
  const codeToId = new Map<string, string>();

  // Accounts are ordered parents-before-children in the template
  for (const entry of template.accounts) {
    const parentId = entry.parentCode ? (codeToId.get(entry.parentCode) ?? null) : null;

    if (entry.parentCode && !codeToId.has(entry.parentCode)) {
      throw new ValidationError(
        `Template integrity error: parent code '${entry.parentCode}' not yet created for account '${entry.code}'`,
      );
    }

    const account = await prisma.account.create({
      data: {
        organisationId,
        code: entry.code,
        name: entry.name,
        description: entry.description ?? null,
        class: entry.class,
        subClass: entry.subClass ?? null,
        type: entry.type,
        parentId,
        isControlAccount: entry.isControlAccount ?? false,
        isBankAccount: entry.isBankAccount ?? false,
        isLocked: entry.isLocked ?? false,
        level: entry.level,
      },
      select: { id: true },
    });

    codeToId.set(entry.code, account.id);
  }

  return { imported: template.accounts.length };
}

// ─── Balance Query ────────────────────────────────────────────────────────────

export async function getAccountBalance(
  organisationId: string,
  accountId: string,
  asOfDate?: Date,
): Promise<{ debit: Prisma.Decimal; credit: Prisma.Decimal; balance: Prisma.Decimal }> {
  const account = await getAccount(organisationId, accountId);

  const dateFilter = asOfDate ? { lte: asOfDate } : undefined;

  const agg = await prisma.ledgerEntry.aggregate({
    where: {
      organisationId,
      accountId,
      ...(dateFilter && { entryDate: dateFilter }),
    },
    _sum: { debitAmount: true, creditAmount: true },
  });

  const debit = agg._sum.debitAmount ?? new Prisma.Decimal(0);
  const credit = agg._sum.creditAmount ?? new Prisma.Decimal(0);

  // Normal balance convention: ASSET/EXPENSE debit-normal, LIABILITY/EQUITY/REVENUE credit-normal
  const debitNormal = account.class === 'ASSET' || account.class === 'EXPENSE';
  const balance = debitNormal ? debit.minus(credit) : credit.minus(debit);

  return { debit, credit, balance };
}
