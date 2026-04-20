import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
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

export const createAccount = async (req: AuthenticatedRequest, res: Response) => {
  const { organisationId } = req.params;
  const input = createAccountSchema.parse(req.body);
  const account = await coaService.createAccount(organisationId, input);
  sendCreated(res, account, 'Account created');
};

export const updateAccount = async (req: AuthenticatedRequest, res: Response) => {
  const { organisationId, accountId } = req.params;
  const input = updateAccountSchema.parse(req.body);
  const account = await coaService.updateAccount(organisationId, accountId, input);
  sendSuccess(res, account, 'Account updated');
};

export const deleteAccount = async (req: AuthenticatedRequest, res: Response) => {
  const { organisationId, accountId } = req.params;
  await coaService.softDeleteAccount(organisationId, accountId);
  sendNoContent(res);
};

export const getAccount = async (req: AuthenticatedRequest, res: Response) => {
  const { organisationId, accountId } = req.params;
  const account = await coaService.getAccount(organisationId, accountId);
  sendSuccess(res, account);
};

export const listAccounts = async (req: AuthenticatedRequest, res: Response) => {
  const { organisationId } = req.params;
  const query = listAccountsSchema.parse(req.query);
  const { accounts, total, page, pageSize } = await coaService.listAccounts(organisationId, query);
  sendPaginated(res, accounts, buildPagination(total, page, pageSize));
};

export const getAccountHierarchy = async (req: AuthenticatedRequest, res: Response) => {
  const { organisationId } = req.params;
  const tree = await coaService.getAccountHierarchy(organisationId);
  sendSuccess(res, tree);
};

export const importTemplate = async (req: AuthenticatedRequest, res: Response) => {
  const { organisationId } = req.params;
  const input = importTemplateSchema.parse(req.body);
  const result = await coaService.importTemplate(organisationId, input);
  sendCreated(res, result, `Imported ${result.imported} accounts from template`);
};

export const getAccountBalance = async (req: AuthenticatedRequest, res: Response) => {
  const { organisationId, accountId } = req.params;
  const asOfDate = req.query.asOfDate ? new Date(req.query.asOfDate as string) : undefined;
  const balance = await coaService.getAccountBalance(organisationId, accountId, asOfDate);
  sendSuccess(res, {
    debit: balance.debit.toFixed(4),
    credit: balance.credit.toFixed(4),
    balance: balance.balance.toFixed(4),
  });
};
