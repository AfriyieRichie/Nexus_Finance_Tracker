import { api } from './api';

export interface Account {
  id: string;
  code: string;
  name: string;
  description: string | null;
  class: string;
  subClass: string | null;
  type: string;
  level: number;
  parentId: string | null;
  isActive: boolean;
  isLocked: boolean;
  isControlAccount: boolean;
  isBankAccount: boolean;
  currency: string | null;
  taxRate: string | null;
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

export const ACCOUNT_TYPES_BY_CLASS: Record<string, { value: string; label: string }[]> = {
  ASSET: [
    { value: 'BANK', label: 'Bank' },
    { value: 'CASH', label: 'Cash & Cash Equivalents' },
    { value: 'RECEIVABLE', label: 'Accounts Receivable' },
    { value: 'INVENTORY', label: 'Inventory' },
    { value: 'FIXED_ASSET', label: 'Fixed Asset' },
    { value: 'INTANGIBLE', label: 'Intangible Asset' },
    { value: 'RIGHT_OF_USE_ASSET', label: 'Right-of-Use Asset' },
    { value: 'TAX_RECEIVABLE', label: 'Tax Receivable' },
    { value: 'INTERCOMPANY', label: 'Intercompany' },
    { value: 'OTHER', label: 'Other Asset' },
  ],
  LIABILITY: [
    { value: 'PAYABLE', label: 'Accounts Payable' },
    { value: 'TAX_PAYABLE', label: 'Tax Payable' },
    { value: 'INTERCOMPANY', label: 'Intercompany' },
    { value: 'OTHER', label: 'Other Liability' },
  ],
  EQUITY: [
    { value: 'EQUITY_ACCOUNT', label: 'Equity Account' },
    { value: 'OTHER', label: 'Other Equity' },
  ],
  REVENUE: [
    { value: 'REVENUE_ACCOUNT', label: 'Revenue' },
    { value: 'OTHER', label: 'Other Revenue' },
  ],
  EXPENSE: [
    { value: 'COST_OF_SALES', label: 'Cost of Sales' },
    { value: 'EXPENSE_ACCOUNT', label: 'Expense' },
    { value: 'OTHER', label: 'Other Expense' },
  ],
};

export async function listAccounts(
  organisationId: string,
  params?: { search?: string; class?: string; isActive?: boolean; page?: number; pageSize?: number },
) {
  const res = await api.get<AccountsResponse>(`/organisations/${organisationId}/accounts`, {
    params: { pageSize: 500, ...params },
  });
  return {
    accounts: res.data.data,
    total: res.data.pagination.total,
    page: res.data.pagination.page,
    pageSize: res.data.pagination.pageSize,
  };
}

export async function importTemplate(organisationId: string, templateName: string) {
  const res = await api.post(`/organisations/${organisationId}/accounts/import-template`, { templateName });
  return res.data.data;
}

export async function createAccount(organisationId: string, data: {
  code: string;
  name: string;
  class: string;
  type: string;
  subClass?: string;
  parentId?: string | null;
  description?: string;
  isControlAccount?: boolean;
  isBankAccount?: boolean;
}) {
  const res = await api.post(`/organisations/${organisationId}/accounts`, data);
  return res.data.data as Account;
}

export async function updateAccount(organisationId: string, accountId: string, data: {
  name?: string;
  description?: string;
  type?: string;
  subClass?: string;
  parentId?: string | null;
  isActive?: boolean;
  isLocked?: boolean;
  isControlAccount?: boolean;
  isBankAccount?: boolean;
}) {
  const res = await api.patch(`/organisations/${organisationId}/accounts/${accountId}`, data);
  return res.data.data as Account;
}

export async function deleteAccount(organisationId: string, accountId: string) {
  await api.delete(`/organisations/${organisationId}/accounts/${accountId}`);
}
