import { api } from './api';

export interface ApprovalRequest {
  id: string;
  entityType: string;
  entityId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ESCALATED' | 'WITHDRAWN';
  currentLevel: number;
  requestedAt: string;
  completedAt: string | null;
  comments: string | null;
  requester?: { firstName: string; lastName: string };
  workflow?: { name: string };
  decisions?: { id: string; levelNumber: number; decision: string; comments: string; decidedAt: string; decider?: { firstName: string; lastName: string } }[];
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
  approvers: ApprovalLevelUser[];
}

export interface ApprovalWorkflow {
  id: string;
  name: string;
  description: string | null;
  entityType: string;
  isActive: boolean;
  levels?: ApprovalLevel[];
}

export async function listRequests(organisationId: string, params?: { status?: string; entityType?: string }) {
  const res = await api.get(`/organisations/${organisationId}/approvals/requests`, { params: { pageSize: 50, ...params } });
  return { requests: res.data.data as ApprovalRequest[], total: res.data.pagination?.total ?? 0 };
}

export async function getRequest(organisationId: string, requestId: string) {
  const res = await api.get(`/organisations/${organisationId}/approvals/requests/${requestId}`);
  return res.data.data as ApprovalRequest;
}

export async function decide(organisationId: string, requestId: string, data: { decision: 'APPROVED' | 'REJECTED'; comments?: string }) {
  const res = await api.post(`/organisations/${organisationId}/approvals/requests/${requestId}/decide`, data);
  return res.data.data;
}

export async function listWorkflows(organisationId: string) {
  const res = await api.get(`/organisations/${organisationId}/approvals/workflows`);
  return res.data.data as ApprovalWorkflow[];
}

export async function getWorkflow(organisationId: string, workflowId: string) {
  const res = await api.get(`/organisations/${organisationId}/approvals/workflows/${workflowId}`);
  return res.data.data as ApprovalWorkflow;
}

export async function createWorkflow(organisationId: string, data: { name: string; description?: string; entityType: string }) {
  const res = await api.post(`/organisations/${organisationId}/approvals/workflows`, data);
  return res.data.data as ApprovalWorkflow;
}

export async function updateWorkflow(organisationId: string, workflowId: string, data: { name?: string; description?: string; isActive?: boolean }) {
  const res = await api.patch(`/organisations/${organisationId}/approvals/workflows/${workflowId}`, data);
  return res.data.data as ApprovalWorkflow;
}

export async function addLevel(organisationId: string, workflowId: string, data: {
  levelNumber: number;
  name: string;
  approvalType: string;
  escalationHours?: number;
  amountThresholdMin?: number;
  amountThresholdMax?: number;
}) {
  const res = await api.post(`/organisations/${organisationId}/approvals/workflows/${workflowId}/levels`, data);
  return res.data.data as ApprovalLevel;
}

export async function removeLevel(organisationId: string, workflowId: string, levelId: string) {
  await api.delete(`/organisations/${organisationId}/approvals/workflows/${workflowId}/levels/${levelId}`);
}

export async function addApprover(organisationId: string, workflowId: string, levelId: string, userId: string) {
  const res = await api.post(`/organisations/${organisationId}/approvals/workflows/${workflowId}/levels/${levelId}/approvers`, { userId });
  return res.data.data as ApprovalLevelUser;
}

export async function removeApprover(organisationId: string, workflowId: string, levelId: string, userId: string) {
  await api.delete(`/organisations/${organisationId}/approvals/workflows/${workflowId}/levels/${levelId}/approvers/${userId}`);
}
