import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { UserRole } from '@prisma/client';
import * as approvalController from './approval.controller';

export const approvalRouter = Router({ mergeParams: true });

// All approval routes require authentication
approvalRouter.use(requireAuth);

// ─── Workflows ────────────────────────────────────────────────────────────────

approvalRouter.post(
  '/workflows',
  requireRole(UserRole.ORG_ADMIN),
  approvalController.createWorkflow,
);

approvalRouter.get(
  '/workflows',
  requireRole(UserRole.FINANCE_MANAGER),
  approvalController.listWorkflows,
);

approvalRouter.get(
  '/workflows/:workflowId',
  requireRole(UserRole.FINANCE_MANAGER),
  approvalController.getWorkflow,
);

approvalRouter.patch(
  '/workflows/:workflowId',
  requireRole(UserRole.ORG_ADMIN),
  approvalController.updateWorkflow,
);

approvalRouter.delete(
  '/workflows/:workflowId',
  requireRole(UserRole.ORG_ADMIN),
  approvalController.deleteWorkflow,
);

// ─── Levels ───────────────────────────────────────────────────────────────────

approvalRouter.post(
  '/workflows/:workflowId/levels',
  requireRole(UserRole.ORG_ADMIN),
  approvalController.addLevel,
);

approvalRouter.delete(
  '/workflows/:workflowId/levels/:levelId',
  requireRole(UserRole.ORG_ADMIN),
  approvalController.removeLevel,
);

// ─── Approvers ────────────────────────────────────────────────────────────────

approvalRouter.post(
  '/workflows/:workflowId/levels/:levelId/approvers',
  requireRole(UserRole.ORG_ADMIN),
  approvalController.addApprover,
);

approvalRouter.delete(
  '/workflows/:workflowId/levels/:levelId/approvers/:userId',
  requireRole(UserRole.ORG_ADMIN),
  approvalController.removeApprover,
);

// ─── Requests & Decisions ─────────────────────────────────────────────────────

approvalRouter.get(
  '/requests',
  requireRole(UserRole.APPROVER),
  approvalController.listRequests,
);

approvalRouter.get(
  '/requests/:requestId',
  requireRole(UserRole.APPROVER),
  approvalController.getRequest,
);

approvalRouter.post(
  '/requests/:requestId/decide',
  requireRole(UserRole.APPROVER),
  approvalController.decide,
);
