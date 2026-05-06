import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendCreated, sendPaginated, buildPagination } from '../../utils/response';
import {
  createBankAccountSchema, importStatementSchema, matchLineSchema, listStatementsSchema,
  confirmReconciliationSchema, createJournalFromLineSchema,
  unlockReconciliationSchema, getUnmatchedEntriesSchema,
} from './bank.schemas';
import * as svc from './bank.service';

export const createBankAccount = asyncHandler(async (req: Request, res: Response) => {
  const input = createBankAccountSchema.parse(req.body);
  return sendCreated(res, await svc.createBankAccount(req.params.organisationId, input), 'Bank account created');
});

export const listBankAccounts = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await svc.listBankAccounts(req.params.organisationId));
});

export const importStatement = asyncHandler(async (req: Request, res: Response) => {
  const input = importStatementSchema.parse(req.body);
  return sendCreated(res, await svc.importStatement(req.params.organisationId, input), 'Statement imported');
});

export const listStatements = asyncHandler(async (req: Request, res: Response) => {
  const query = listStatementsSchema.parse(req.query);
  const { statements, total, page, pageSize } = await svc.listStatements(req.params.organisationId, query);
  return sendPaginated(res, statements, buildPagination(page, pageSize, total));
});

export const getStatement = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await svc.getStatement(req.params.organisationId, req.params.statementId));
});

export const matchLine = asyncHandler(async (req: Request, res: Response) => {
  const input = matchLineSchema.parse(req.body);
  return sendSuccess(res, await svc.matchLine(req.params.organisationId, input), 'Line matched');
});

export const unmatchLine = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await svc.unmatchLine(req.params.organisationId, req.params.lineId), 'Line unmatched');
});

export const autoMatch = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await svc.autoMatch(req.params.organisationId, req.params.statementId), 'Auto-match complete');
});

export const getReconciliationSummary = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await svc.getReconciliationSummary(req.params.organisationId, req.params.statementId));
});

export const confirmReconciliation = asyncHandler(async (req: Request, res: Response) => {
  const input = confirmReconciliationSchema.parse(req.body);
  const userId = (req as any).user?.id ?? 'system';
  return sendSuccess(res, await svc.confirmReconciliation(req.params.organisationId, req.params.statementId, userId, input), 'Reconciliation confirmed and locked');
});

export const createJournalFromLine = asyncHandler(async (req: Request, res: Response) => {
  const input = createJournalFromLineSchema.parse(req.body);
  const userId = (req as any).user?.id ?? 'system';
  return sendCreated(res, await svc.createJournalFromLine(req.params.organisationId, req.params.lineId, userId, input), 'Journal created and line matched');
});

// ─── Phase 2 ─────────────────────────────────────────────────────────────────

export const getUnmatchedLedgerEntries = asyncHandler(async (req: Request, res: Response) => {
  const query = getUnmatchedEntriesSchema.parse(req.query);
  return sendSuccess(res, await svc.getUnmatchedLedgerEntries(req.params.organisationId, req.params.bankAccountId, query));
});

export const unlockReconciliation = asyncHandler(async (req: Request, res: Response) => {
  const input = unlockReconciliationSchema.parse(req.body);
  const userId = (req as any).user?.id ?? 'system';
  return sendSuccess(res, await svc.unlockReconciliation(req.params.organisationId, req.params.statementId, userId, input), 'Reconciliation unlocked');
});

// ─── Phase 3 ─────────────────────────────────────────────────────────────────

export const getReconciliationReport = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await svc.getReconciliationReport(req.params.organisationId, req.params.statementId));
});
