import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendCreated, sendNoContent, sendPaginated, buildPagination } from '../../utils/response';
import {
  createJournalSchema,
  updateJournalSchema,
  listJournalsSchema,
  approveRejectSchema,
  reverseJournalSchema,
} from './journal.schemas';
import * as journalService from './journal.service';

export const createJournalEntry = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const input = createJournalSchema.parse(req.body);
  const entry = await journalService.createJournalEntry(organisationId, input, req.user!.sub);
  return sendCreated(res, entry, `Journal entry ${entry.journalNumber} created`);
});

export const updateJournalEntry = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, journalId } = req.params;
  const input = updateJournalSchema.parse(req.body);
  const entry = await journalService.updateJournalEntry(organisationId, journalId, input, req.user!.sub);
  return sendSuccess(res, entry, 'Journal entry updated');
});

export const deleteJournalEntry = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, journalId } = req.params;
  await journalService.deleteJournalEntry(organisationId, journalId);
  return sendNoContent(res);
});

export const getJournalEntry = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, journalId } = req.params;
  const entry = await journalService.getJournalEntry(organisationId, journalId);
  return sendSuccess(res, entry);
});

export const listJournalEntries = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const query = listJournalsSchema.parse(req.query);
  const { entries, total, page, pageSize } = await journalService.listJournalEntries(organisationId, query);
  return sendPaginated(res, entries, buildPagination(page, pageSize, total));
});

export const submitForApproval = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, journalId } = req.params;
  const entry = await journalService.submitForApproval(organisationId, journalId, req.user!.sub);
  return sendSuccess(res, entry, 'Journal entry submitted for approval');
});

export const approveJournalEntry = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, journalId } = req.params;
  const input = approveRejectSchema.parse(req.body);
  const entry = await journalService.approveJournalEntry(organisationId, journalId, req.user!.sub, input);
  return sendSuccess(res, entry, 'Journal entry approved');
});

export const rejectJournalEntry = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, journalId } = req.params;
  const input = approveRejectSchema.parse(req.body);
  const entry = await journalService.rejectJournalEntry(organisationId, journalId, req.user!.sub, input);
  return sendSuccess(res, entry, 'Journal entry rejected and returned to draft');
});

export const postJournalEntry = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, journalId } = req.params;
  const entry = await journalService.postJournalEntry(organisationId, journalId, req.user!.sub);
  return sendSuccess(res, entry, `Journal entry ${entry.journalNumber} posted to ledger`);
});

export const reverseJournalEntry = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, journalId } = req.params;
  const input = reverseJournalSchema.parse(req.body);
  const reversal = await journalService.reverseJournalEntry(organisationId, journalId, req.user!.sub, input);
  return sendCreated(res, reversal, `Reversal entry ${reversal.journalNumber} created and posted`);
});
