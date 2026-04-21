import { api } from './api';

export interface JournalLine {
  id: string;
  lineNumber: number;
  accountId: string;
  account?: { code: string; name: string };
  description: string | null;
  debitAmount: string;
  creditAmount: string;
  currency: string;
}

export interface JournalEntry {
  id: string;
  journalNumber: string;
  type: string;
  status: string;
  description: string;
  reference: string | null;
  entryDate: string;
  currency: string;
  createdAt: string;
  creator?: { firstName: string; lastName: string };
  period?: { name: string };
  lines?: JournalLine[];
  _count?: { lines: number };
}

export interface JournalsResponse {
  data: JournalEntry[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export async function listJournals(
  organisationId: string,
  params?: { status?: string; page?: number; pageSize?: number },
) {
  const res = await api.get<JournalsResponse>(`/organisations/${organisationId}/journals`, {
    params: { pageSize: 20, ...params },
  });
  return {
    entries: res.data.data,
    total: res.data.pagination.total,
    page: res.data.pagination.page,
    pageSize: res.data.pagination.pageSize,
  };
}

export async function getJournal(organisationId: string, journalId: string) {
  const res = await api.get(`/organisations/${organisationId}/journals/${journalId}`);
  return res.data.data as JournalEntry;
}

export interface CreateJournalInput {
  type: string;
  description: string;
  entryDate: string;
  periodId: string;
  currency: string;
  exchangeRate: number;
  reference?: string;
  lines: Array<{
    accountId: string;
    description?: string;
    debitAmount: number;
    creditAmount: number;
    currency?: string;
    exchangeRate?: number;
  }>;
}

export async function createJournal(organisationId: string, data: CreateJournalInput) {
  const res = await api.post(`/organisations/${organisationId}/journals`, data);
  return res.data.data as JournalEntry;
}

export async function submitJournal(organisationId: string, journalId: string) {
  const res = await api.post(`/organisations/${organisationId}/journals/${journalId}/submit`);
  return res.data.data;
}
