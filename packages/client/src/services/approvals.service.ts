import { api } from './api';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ApprovalDecisionType  = 'APPROVED' | 'REJECTED' | 'DELEGATED';
export type ApprovalRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ESCALATED' | 'WITHDRAWN';
export type NotificationType =
  | 'APPROVAL_REQUESTED' | 'APPROVAL_APPROVED' | 'APPROVAL_REJECTED'
  | 'APPROVAL_ESCALATED' | 'APPROVAL_DELEGATED';

export interface ApprovalDecision {
  id: string;
  levelNumber: number;
  decision: ApprovalDecisionType;
  comments: string | null;
  decidedAt: string;
  decider?: { id: string; firstName: string; lastName: string };
  delegatee?: { id: string; firstName: string; lastName: string } | null;
}

export interface ApprovalRequest {
  id: string;
  entityType: string;
  entityId: string;
  status: ApprovalRequestStatus;
  currentLevel: number;
  requestedAt: string;
  completedAt: string | null;
  comments: string | null;
  slaDeadline: string | null;
  escalatedAt: string | null;
  requester?: { id: string; firstName: string; lastName: string };
  workflow?: { name: string; entityType: string };
  decisions?: ApprovalDecision[];
  changeType?: string | null;
  payload?: Record<string, unknown> | null;
}

export interface ApprovalLevelUser {
  id: string;
  userId: string;
  user: { id: string; firstName: string; lastName: string; email: string };
}

export interface ApprovalLevel {
  id: string;
  levelNumber: number;
  name: string;
  approvalType: 'ANY_ONE' | 'ALL_REQUIRED' | 'MAJORITY';
  amountThresholdMin: string | null;
  amountThresholdMax: string | null;
  escalationHours: number | null;
  escalateTo: string | null;
  approvers: ApprovalLevelUser[];
}

export interface ApprovalWorkflow {
  id: string;
  name: string;
  description: string | null;
  entityType: string;
  isActive: boolean;
  levels?: ApprovalLevel[];
  _count?: { requests: number };
}

export interface ApprovalDelegation {
  id: string;
  organisationId: string;
  workflowId: string | null;
  delegatedBy: string;
  delegatedTo: string;
  validFrom: string;
  validTo: string;
  isActive: boolean;
  reason: string | null;
  createdAt: string;
  delegator?: { id: string; firstName: string; lastName: string };
  delegatee?: { id: string; firstName: string; lastName: string };
}

export interface AppNotification {
  id: string;
  userId: string;
  organisationId: string;
  type: NotificationType;
  title: string;
  body: string;
  entityId: string | null;
  entityType: string | null;
  isRead: boolean;
  createdAt: string;
}

// ── Requests ──────────────────────────────────────────────────────────────────

export const listRequests = (organisationId: string, params?: { status?: string; mine?: boolean }) =>
  api.get(`/organisations/${organisationId}/approvals/requests`, { params: { pageSize: 100, ...params } })
    .then((r) => ({ requests: r.data.data as ApprovalRequest[], total: r.data.pagination?.total ?? 0 }));

export const getRequest = (organisationId: string, requestId: string) =>
  api.get(`/organisations/${organisationId}/approvals/requests/${requestId}`)
    .then((r) => r.data.data as ApprovalRequest);

export const decide = (
  organisationId: string,
  requestId: string,
  data: { decision: ApprovalDecisionType; comments?: string; delegatedTo?: string },
) =>
  api.post(`/organisations/${organisationId}/approvals/requests/${requestId}/decide`, data)
    .then((r) => r.data.data);

export const withdrawRequest = (organisationId: string, requestId: string) =>
  api.post(`/organisations/${organisationId}/approvals/requests/${requestId}/withdraw`)
    .then((r) => r.data.data);

// ── Workflows ─────────────────────────────────────────────────────────────────

export const listWorkflows = (organisationId: string) =>
  api.get(`/organisations/${organisationId}/approvals/workflows`)
    .then((r) => r.data.data as ApprovalWorkflow[]);

export const getWorkflow = (organisationId: string, workflowId: string) =>
  api.get(`/organisations/${organisationId}/approvals/workflows/${workflowId}`)
    .then((r) => r.data.data as ApprovalWorkflow);

export const createWorkflow = (organisationId: string, data: { name: string; description?: string; entityType: string }) =>
  api.post(`/organisations/${organisationId}/approvals/workflows`, data)
    .then((r) => r.data.data as ApprovalWorkflow);

export const updateWorkflow = (organisationId: string, workflowId: string, data: { name?: string; description?: string; isActive?: boolean }) =>
  api.patch(`/organisations/${organisationId}/approvals/workflows/${workflowId}`, data)
    .then((r) => r.data.data as ApprovalWorkflow);

export const addLevel = (organisationId: string, workflowId: string, data: {
  levelNumber: number; name: string; approvalType: string;
  escalationHours?: number; escalateTo?: string;
  amountThresholdMin?: number; amountThresholdMax?: number;
}) =>
  api.post(`/organisations/${organisationId}/approvals/workflows/${workflowId}/levels`, data)
    .then((r) => r.data.data as ApprovalLevel);

export const removeLevel = (organisationId: string, workflowId: string, levelId: string) =>
  api.delete(`/organisations/${organisationId}/approvals/workflows/${workflowId}/levels/${levelId}`);

export const addApprover = (organisationId: string, workflowId: string, levelId: string, userId: string) =>
  api.post(`/organisations/${organisationId}/approvals/workflows/${workflowId}/levels/${levelId}/approvers`, { userId })
    .then((r) => r.data.data as ApprovalLevelUser);

export const removeApprover = (organisationId: string, workflowId: string, levelId: string, userId: string) =>
  api.delete(`/organisations/${organisationId}/approvals/workflows/${workflowId}/levels/${levelId}/approvers/${userId}`);

// ── Delegations ───────────────────────────────────────────────────────────────

export const listDelegations = (organisationId: string, mine = false) =>
  api.get(`/organisations/${organisationId}/approvals/delegations`, { params: mine ? { mine: true } : undefined })
    .then((r) => r.data.data as ApprovalDelegation[]);

export const createDelegation = (organisationId: string, data: {
  delegatedTo: string; validFrom: string; validTo: string; workflowId?: string; reason?: string;
}) =>
  api.post(`/organisations/${organisationId}/approvals/delegations`, data)
    .then((r) => r.data.data as ApprovalDelegation);

export const revokeDelegation = (organisationId: string, id: string) =>
  api.delete(`/organisations/${organisationId}/approvals/delegations/${id}`)
    .then((r) => r.data.data as ApprovalDelegation);

// ── Notifications ─────────────────────────────────────────────────────────────

export const listNotifications = (organisationId: string, unreadOnly = false) =>
  api.get(`/organisations/${organisationId}/approvals/notifications`, { params: unreadOnly ? { unreadOnly: true } : undefined })
    .then((r) => r.data.data as AppNotification[]);

export const markRead = (organisationId: string, ids?: string[]) =>
  api.post(`/organisations/${organisationId}/approvals/notifications/mark-read`, { ids });

export const getUnreadCount = (organisationId: string) =>
  api.get(`/organisations/${organisationId}/approvals/notifications/unread-count`)
    .then((r) => (r.data.data as { count: number }).count);
