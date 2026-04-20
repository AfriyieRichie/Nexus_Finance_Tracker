import { z } from 'zod';
import { ApprovalEntityType, ApprovalType, ApprovalDecisionType } from '@prisma/client';

export const createWorkflowSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  description: z.string().max(500).trim().optional(),
  entityType: z.nativeEnum(ApprovalEntityType),
});

export const updateWorkflowSchema = z.object({
  name: z.string().min(1).max(100).trim().optional(),
  description: z.string().max(500).trim().optional(),
  isActive: z.boolean().optional(),
});

export const createLevelSchema = z.object({
  levelNumber: z.number().int().min(1).max(10),
  name: z.string().min(1).max(100).trim(),
  approvalType: z.nativeEnum(ApprovalType),
  amountThresholdMin: z.number().min(0).optional(),
  amountThresholdMax: z.number().min(0).optional(),
  escalationHours: z.number().int().min(1).optional(),
});

export const addApproverSchema = z.object({
  userId: z.string().uuid(),
});

export const decisionSchema = z.object({
  decision: z.nativeEnum(ApprovalDecisionType),
  comments: z.string().max(1000).trim().optional(),
  delegatedTo: z.string().uuid().optional(),
});

export type CreateWorkflowInput = z.infer<typeof createWorkflowSchema>;
export type UpdateWorkflowInput = z.infer<typeof updateWorkflowSchema>;
export type CreateLevelInput = z.infer<typeof createLevelSchema>;
export type AddApproverInput = z.infer<typeof addApproverSchema>;
export type DecisionInput = z.infer<typeof decisionSchema>;
