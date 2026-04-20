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

export interface TrialBalanceResponse {
  data: {
    lines: TrialBalanceLine[];
    totalDebit: string;
    totalCredit: string;
    isBalanced: boolean;
  };
}

export async function getTrialBalance(
  organisationId: string,
  params?: { asOfDate?: string; periodId?: string },
) {
  const res = await api.get<TrialBalanceResponse>(
    `/organisations/${organisationId}/ledger/trial-balance`,
    { params },
  );
  return res.data.data;
}
