import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendCreated, sendNoContent } from '../../utils/response';
import { ValidationError } from '../../utils/errors';
import {
  createWorkflowSchema,
  updateWorkflowSchema,
  createLevelSchema,
  addApproverSchema,
  decisionSchema,
} from './approval.schemas';
import * as svc from './approval.service';
import { ApprovalRequestStatus } from '@prisma/client';

// ─── Workflows ────────────────────────────────────────────────────────────────

export const createWorkflow = asyncHandler(async (req: Request, res: Response) => {
  const input = createWorkflowSchema.parse(req.body);
  return sendCreated(res, await svc.createWorkflow(req.params.organisationId, input), 'Approval workflow created');
});

export const listWorkflows = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await svc.listWorkflows(req.params.organisationId));
});

export const getWorkflow = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await svc.getWorkflow(req.params.organisationId, req.params.workflowId));
});

export const updateWorkflow = asyncHandler(async (req: Request, res: Response) => {
  const input = updateWorkflowSchema.parse(req.body);
  return sendSuccess(res, await svc.updateWorkflow(req.params.organisationId, req.params.workflowId, input));
});

export const deleteWorkflow = asyncHandler(async (req: Request, res: Response) => {
  await svc.deleteWorkflow(req.params.organisationId, req.params.workflowId);
  return sendNoContent(res);
});

// ─── Levels ───────────────────────────────────────────────────────────────────

export const addLevel = asyncHandler(async (req: Request, res: Response) => {
  const input = createLevelSchema.parse(req.body);
  const level = await svc.addLevel(req.params.organisationId, req.params.workflowId, input);
  return sendCreated(res, level, `Level ${input.levelNumber} added`);
});

export const removeLevel = asyncHandler(async (req: Request, res: Response) => {
  await svc.removeLevel(req.params.organisationId, req.params.workflowId, req.params.levelId);
  return sendNoContent(res);
});

export const addApprover = asyncHandler(async (req: Request, res: Response) => {
  const input = addApproverSchema.parse(req.body);
  return sendCreated(res, await svc.addApprover(req.params.organisationId, req.params.workflowId, req.params.levelId, input), 'Approver added');
});

export const removeApprover = asyncHandler(async (req: Request, res: Response) => {
  await svc.removeApprover(req.params.organisationId, req.params.workflowId, req.params.levelId, req.params.userId);
  return sendNoContent(res);
});

// ─── Requests & Decisions ─────────────────────────────────────────────────────

export const listRequests = asyncHandler(async (req: Request, res: Response) => {
  const status  = req.query.status  as ApprovalRequestStatus | undefined;
  const mine    = req.query.mine === 'true';
  const userId  = mine ? req.user!.sub : undefined;
  return sendSuccess(res, await svc.listRequests(req.params.organisationId, status, userId));
});

export const getRequest = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await svc.getRequest(req.params.organisationId, req.params.requestId));
});

export const decide = asyncHandler(async (req: Request, res: Response) => {
  const input  = decisionSchema.parse(req.body);
  const result = await svc.decide(req.params.organisationId, req.params.requestId, req.user!.sub, input);
  return sendSuccess(res, result, `Decision recorded: ${result.status}`);
});

export const withdrawRequest = asyncHandler(async (req: Request, res: Response) => {
  const result = await svc.withdrawRequest(req.params.organisationId, req.params.requestId, req.user!.sub);
  return sendSuccess(res, result, 'Approval request withdrawn');
});

// ─── Delegations ──────────────────────────────────────────────────────────────

export const createDelegation = asyncHandler(async (req: Request, res: Response) => {
  const { delegatedTo, validFrom, validTo, workflowId, reason } = req.body as Record<string, string>;
  if (!delegatedTo || !validFrom || !validTo) {
    throw new ValidationError('delegatedTo, validFrom, and validTo are required');
  }
  const result = await svc.createDelegation(req.params.organisationId, req.user!.sub, {
    delegatedTo,
    validFrom,
    validTo,
    workflowId: workflowId || undefined,
    reason:     reason     || undefined,
  });
  return sendCreated(res, result, 'Delegation created');
});

export const listDelegations = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.query.mine === 'true' ? req.user!.sub : undefined;
  return sendSuccess(res, await svc.listDelegations(req.params.organisationId, userId));
});

export const revokeDelegation = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await svc.revokeDelegation(req.params.organisationId, req.params.id, req.user!.sub));
});

// ─── Notifications ────────────────────────────────────────────────────────────

export const listNotifications = asyncHandler(async (req: Request, res: Response) => {
  const unreadOnly = req.query.unreadOnly === 'true';
  return sendSuccess(res, await svc.listNotifications(req.params.organisationId, req.user!.sub, unreadOnly));
});

export const markRead = asyncHandler(async (req: Request, res: Response) => {
  const ids = Array.isArray(req.body.ids) ? (req.body.ids as string[]) : undefined;
  await svc.markNotificationsRead(req.params.organisationId, req.user!.sub, ids);
  return sendNoContent(res);
});

export const getUnreadCount = asyncHandler(async (req: Request, res: Response) => {
  const count = await svc.getUnreadCount(req.params.organisationId, req.user!.sub);
  return sendSuccess(res, { count });
});
