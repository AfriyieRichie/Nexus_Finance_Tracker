import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendCreated, sendNoContent } from '../../utils/response';
import {
  createWorkflowSchema,
  updateWorkflowSchema,
  createLevelSchema,
  addApproverSchema,
  decisionSchema,
} from './approval.schemas';
import * as approvalService from './approval.service';
import { ApprovalRequestStatus } from '@prisma/client';

// ─── Workflows ────────────────────────────────────────────────────────────────

export const createWorkflow = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const input = createWorkflowSchema.parse(req.body);
  const wf = await approvalService.createWorkflow(organisationId, input);
  return sendCreated(res, wf, 'Approval workflow created');
});

export const listWorkflows = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  return sendSuccess(res, await approvalService.listWorkflows(organisationId));
});

export const getWorkflow = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, workflowId } = req.params;
  return sendSuccess(res, await approvalService.getWorkflow(organisationId, workflowId));
});

export const updateWorkflow = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, workflowId } = req.params;
  const input = updateWorkflowSchema.parse(req.body);
  return sendSuccess(res, await approvalService.updateWorkflow(organisationId, workflowId, input));
});

export const deleteWorkflow = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, workflowId } = req.params;
  await approvalService.deleteWorkflow(organisationId, workflowId);
  return sendNoContent(res);
});

// ─── Levels ───────────────────────────────────────────────────────────────────

export const addLevel = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, workflowId } = req.params;
  const input = createLevelSchema.parse(req.body);
  const level = await approvalService.addLevel(organisationId, workflowId, input);
  return sendCreated(res, level, `Level ${input.levelNumber} added`);
});

export const removeLevel = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, workflowId, levelId } = req.params;
  await approvalService.removeLevel(organisationId, workflowId, levelId);
  return sendNoContent(res);
});

export const addApprover = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, workflowId, levelId } = req.params;
  const input = addApproverSchema.parse(req.body);
  const result = await approvalService.addApprover(organisationId, workflowId, levelId, input);
  return sendCreated(res, result, 'Approver added');
});

export const removeApprover = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, workflowId, levelId, userId } = req.params;
  await approvalService.removeApprover(organisationId, workflowId, levelId, userId);
  return sendNoContent(res);
});

// ─── Requests & Decisions ─────────────────────────────────────────────────────

export const listRequests = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const status = req.query.status as ApprovalRequestStatus | undefined;
  return sendSuccess(res, await approvalService.listRequests(organisationId, status));
});

export const getRequest = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, requestId } = req.params;
  return sendSuccess(res, await approvalService.getRequest(organisationId, requestId));
});

export const decide = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId, requestId } = req.params;
  const input = decisionSchema.parse(req.body);
  const result = await approvalService.decide(organisationId, requestId, req.user!.sub, input);
  return sendSuccess(res, result, `Decision recorded: ${result.status}`);
});
