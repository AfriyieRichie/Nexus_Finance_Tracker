import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  sendSuccess,
  sendCreated,
  sendNoContent,
  sendPaginated,
  buildPagination,
} from '../../utils/response';
import {
  createAccountSchema,
  updateAccountSchema,
  listAccountsSchema,
  importTemplateSchema,
} from './coa.schemas';
import * as coaService from './coa.service';

export const createAccount = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const input = createAccountSchema.parse(req.body);
  const account = await coaService.createAccount(organisationId, input);
  return sendCreated(res, account, 'Account created');
});

export const updateAccount = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, accountId } = req.params;
  const input = updateAccountSchema.parse(req.body);
  const account = await coaService.updateAccount(organisationId, accountId, input);
  return sendSuccess(res, account, 'Account updated');
});

export const deleteAccount = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, accountId } = req.params;
  await coaService.softDeleteAccount(organisationId, accountId);
  return sendNoContent(res);
});

export const getAccount = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, accountId } = req.params;
  const account = await coaService.getAccount(organisationId, accountId);
  return sendSuccess(res, account);
});

export const listAccounts = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const query = listAccountsSchema.parse(req.query);
  const { accounts, total, page, pageSize } = await coaService.listAccounts(organisationId, query);
  return sendPaginated(res, accounts, buildPagination(page, pageSize, total));
});

export const getAccountHierarchy = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const tree = await coaService.getAccountHierarchy(organisationId);
  return sendSuccess(res, tree);
});

export const importTemplate = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const input = importTemplateSchema.parse(req.body);
  const result = await coaService.importTemplate(organisationId, input);
  return sendCreated(res, result, `Imported ${result.imported} accounts from template`);
});

export const getAccountBalance = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, accountId } = req.params;
  const asOfDate = req.query.asOfDate ? new Date(req.query.asOfDate as string) : undefined;
  const balance = await coaService.getAccountBalance(organisationId, accountId, asOfDate);
  return sendSuccess(res, {
    debit: balance.debit.toFixed(4),
    credit: balance.credit.toFixed(4),
    balance: balance.balance.toFixed(4),
  });
});
