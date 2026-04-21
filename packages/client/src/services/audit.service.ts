import { api } from './api';

export interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  userId: string | null;
  ipAddress: string | null;
  timestamp: string;
  user?: { firstName: string; lastName: string; email: string };
}

export async function listAuditLogs(
  organisationId: string,
  params?: {
    action?: string;
    entityType?: string;
    entityId?: string;
    userId?: string;
    fromDate?: string;
    toDate?: string;
    page?: number;
    pageSize?: number;
  },
) {
  const res = await api.get(`/organisations/${organisationId}/audit`, {
    params: { pageSize: 50, ...params },
  });
  return {
    logs: res.data.data as AuditLog[],
    total: res.data.pagination?.total ?? 0,
    totalPages: res.data.pagination?.totalPages ?? 1,
    hasNext: res.data.pagination?.hasNext ?? false,
    hasPrev: res.data.pagination?.hasPrev ?? false,
  };
}

export async function getAuditLog(organisationId: string, logId: string) {
  const res = await api.get(`/organisations/${organisationId}/audit/${logId}`);
  return res.data.data as AuditLog;
}
