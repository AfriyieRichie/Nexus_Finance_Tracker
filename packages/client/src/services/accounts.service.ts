import { api } from './api';

export interface Account {
  id: string;
  code: string;
  name: string;
  class: string;
  subClass: string | null;
  type: string;
  level: number;
  isActive: boolean;
  isLocked: boolean;
  parentId: string | null;
  description: string | null;
}

export interface AccountsResponse {
  data: Account[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export async function listAccounts(
  organisationId: string,
  params?: { search?: string; class?: string; page?: number; pageSize?: number },
) {
  const res = await api.get<AccountsResponse>(`/organisations/${organisationId}/accounts`, {
    params: { pageSize: 200, ...params },
  });
  return {
    accounts: res.data.data,
    total: res.data.pagination.total,
    page: res.data.pagination.page,
    pageSize: res.data.pagination.pageSize,
  };
}

export async function importTemplate(organisationId: string, templateName: string) {
  const res = await api.post(`/organisations/${organisationId}/accounts/import-template`, {
    templateName,
  });
  return res.data.data;
}

export async function createAccount(organisationId: string, data: {
  code: string;
  name: string;
  class: string;
  type: string;
  parentId?: string;
  description?: string;
}) {
  const res = await api.post(`/organisations/${organisationId}/accounts`, data);
  return res.data.data;
}
