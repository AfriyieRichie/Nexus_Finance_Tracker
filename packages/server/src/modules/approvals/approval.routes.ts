import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { UserRole } from '@prisma/client';
import * as ctrl from './approval.controller';

const { ORG_ADMIN, FINANCE_MANAGER, APPROVER, REPORT_VIEWER } = UserRole;

export const approvalRouter = Router({ mergeParams: true });
approvalRouter.use(requireAuth);

// ─── Workflows ────────────────────────────────────────────────────────────────
approvalRouter.post('/workflows',                                                 requireRole(ORG_ADMIN),       ctrl.createWorkflow);
approvalRouter.get('/workflows',                                                  requireRole(FINANCE_MANAGER), ctrl.listWorkflows);
approvalRouter.get('/workflows/:workflowId',                                      requireRole(FINANCE_MANAGER), ctrl.getWorkflow);
approvalRouter.patch('/workflows/:workflowId',                                    requireRole(ORG_ADMIN),       ctrl.updateWorkflow);
approvalRouter.delete('/workflows/:workflowId',                                   requireRole(ORG_ADMIN),       ctrl.deleteWorkflow);

// ─── Levels ───────────────────────────────────────────────────────────────────
approvalRouter.post('/workflows/:workflowId/levels',                              requireRole(ORG_ADMIN),       ctrl.addLevel);
approvalRouter.delete('/workflows/:workflowId/levels/:levelId',                   requireRole(ORG_ADMIN),       ctrl.removeLevel);
approvalRouter.post('/workflows/:workflowId/levels/:levelId/approvers',           requireRole(ORG_ADMIN),       ctrl.addApprover);
approvalRouter.delete('/workflows/:workflowId/levels/:levelId/approvers/:userId', requireRole(ORG_ADMIN),       ctrl.removeApprover);

// ─── Requests & Decisions ─────────────────────────────────────────────────────
approvalRouter.get('/requests',                requireRole(APPROVER), ctrl.listRequests);
approvalRouter.get('/requests/:requestId',     requireRole(APPROVER), ctrl.getRequest);
approvalRouter.post('/requests/:requestId/decide',    requireRole(APPROVER), ctrl.decide);
approvalRouter.post('/requests/:requestId/withdraw',  requireRole(APPROVER), ctrl.withdrawRequest);

// ─── Delegations ──────────────────────────────────────────────────────────────
approvalRouter.get('/delegations',    requireRole(REPORT_VIEWER), ctrl.listDelegations);
approvalRouter.post('/delegations',   requireRole(APPROVER),      ctrl.createDelegation);
approvalRouter.delete('/delegations/:id', requireRole(APPROVER),  ctrl.revokeDelegation);

// ─── Notifications ────────────────────────────────────────────────────────────
approvalRouter.get('/notifications',           requireRole(REPORT_VIEWER), ctrl.listNotifications);
approvalRouter.post('/notifications/mark-read', requireRole(REPORT_VIEWER), ctrl.markRead);
approvalRouter.get('/notifications/unread-count', requireRole(REPORT_VIEWER), ctrl.getUnreadCount);
