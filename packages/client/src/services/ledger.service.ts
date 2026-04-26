import { api } from './api';

export interface TrialBalanceLine {
  accountId: string;
  code: string;
  name: string;
  class: string;
  type: string;
  totalDebit: string;
  totalCredit: string;
  balance: string;
  normalBalance: 'DEBIT' | 'CREDIT';
}

export interface TrialBalanceResult {
  lines: TrialBalanceLine[];
  totalDebit: string;
  totalCredit: string;
  isBalanced: boolean;
}

export interface LedgerEntry {
  id: string;
  transactionDate: string;
  debitAmount: string;
  creditAmount: string;
  journalEntry: {
    journalNumber: string;
    type: string;
    description: string | null;
    reference: string | null;
  };
}

export interface AccountLedgerResult {
  account: {
    id: string;
    code: string;
    name: string;
    class: string;
    type: string;
  };
  entries: LedgerEntry[];
  openingBalance: string;
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export async function getTrialBalance(
  organisationId: string,
  params?: {
    asOfDate?: string;
    periodId?: string;
    fromDate?: string;
    toDate?: string;
    includeZeroBalances?: boolean;
  },
) {
  const res = await api.get<{ data: TrialBalanceResult }>(
    `/organisations/${organisationId}/ledger/trial-balance`,
    { params },
  );
  return res.data.data;
}

export async function getAccountLedger(
  organisationId: string,
  accountId: string,
  params?: {
    fromDate?: string;
    toDate?: string;
    periodId?: string;
    page?: number;
    pageSize?: number;
  },
) {
  const res = await api.get<{ data: AccountLedgerResult }>(
    `/organisations/${organisationId}/accounts/${accountId}/ledger`,
    { params: { page: 1, pageSize: 100, ...params } },
  );
  return res.data.data;
}
