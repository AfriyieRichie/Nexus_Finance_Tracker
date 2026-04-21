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
  data: {
    accounts: Account[];
    total: number;
    page: number;
    pageSize: number;
  };
}

export async function listAccounts(
  organisationId: string,
  params?: { search?: string; class?: string; page?: number; pageSize?: number },
) {
  const res = await api.get<AccountsResponse>(`/organisations/${organisationId}/accounts`, {
    params: { pageSize: 100, ...params },
  });
  return res.data.data;
}

export async function importTemplate(organisationId: string, template: string) {
  const res = await api.post(`/organisations/${organisationId}/accounts/import-template`, {
    template,
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
