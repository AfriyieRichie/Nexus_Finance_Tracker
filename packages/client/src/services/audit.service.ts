import { api } from './api';

export interface AuditLog {
  id: string;
  action: string;
  module: string | null;
  entityType: string;
  entityId: string | null;
  entityRef: string | null;
  description: string | null;
  userId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  previousValue: unknown;
  newValue: unknown;
  timestamp: string;
  user?: { firstName: string; lastName: string; email: string };
}

export interface ListAuditParams {
  action?: string;
  module?: string;
  entityType?: string;
  entityId?: string;
  entityRef?: string;
  search?: string;
  userId?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  pageSize?: number;
}

export async function listAuditLogs(organisationId: string, params?: ListAuditParams) {
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

export function buildExportUrl(organisationId: string, params?: ListAuditParams): string {
  const base = api.defaults.baseURL ?? '';
  const query = new URLSearchParams();
  if (params?.action)     query.set('action',     params.action);
  if (params?.module)     query.set('module',     params.module);
  if (params?.entityType) query.set('entityType', params.entityType);
  if (params?.entityRef)  query.set('entityRef',  params.entityRef);
  if (params?.search)     query.set('search',     params.search);
  if (params?.userId)     query.set('userId',     params.userId);
  if (params?.fromDate)   query.set('fromDate',   params.fromDate);
  if (params?.toDate)     query.set('toDate',     params.toDate);
  return `${base}/organisations/${organisationId}/audit/export?${query.toString()}`;
}
