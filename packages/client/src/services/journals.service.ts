import { api } from './api';

export interface JournalLine {
  id: string;
  lineNumber: number;
  accountId: string;
  account?: { code: string; name: string; class: string };
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
  approvedAt: string | null;
  postedAt: string | null;
  creator?: { id: string; firstName: string; lastName: string };
  approver?: { firstName: string; lastName: string };
  poster?: { firstName: string; lastName: string };
  periodId?: string;
  period?: { name: string; fiscalYear: number };
  lines?: JournalLine[];
  reversedByEntryId?: string | null;
  reversalEntry?: { id: string; journalNumber: string } | null;
  _count?: { lines: number };
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

export async function listJournals(
  organisationId: string,
  params?: { status?: string; page?: number; pageSize?: number; search?: string; fromDate?: string; toDate?: string; createdByMe?: boolean },
) {
  const res = await api.get(`/organisations/${organisationId}/journals`, {
    params: { pageSize: 20, ...params },
  });
  return {
    entries: res.data.data as JournalEntry[],
    total: res.data.pagination.total as number,
    page: res.data.pagination.page as number,
    pageSize: res.data.pagination.pageSize as number,
  };
}

export async function getJournal(organisationId: string, journalId: string) {
  const res = await api.get(`/organisations/${organisationId}/journals/${journalId}`);
  return res.data.data as JournalEntry;
}

export async function createJournal(organisationId: string, data: CreateJournalInput) {
  const res = await api.post(`/organisations/${organisationId}/journals`, data);
  return res.data.data as JournalEntry;
}

export async function updateJournal(organisationId: string, journalId: string, data: Partial<CreateJournalInput>) {
  const res = await api.patch(`/organisations/${organisationId}/journals/${journalId}`, data);
  return res.data.data as JournalEntry;
}

export async function deleteJournal(organisationId: string, journalId: string) {
  await api.delete(`/organisations/${organisationId}/journals/${journalId}`);
}

export async function submitJournal(organisationId: string, journalId: string) {
  const res = await api.post(`/organisations/${organisationId}/journals/${journalId}/submit`);
  return res.data.data;
}

export async function approveJournal(organisationId: string, journalId: string, data: { comments?: string }) {
  const res = await api.post(`/organisations/${organisationId}/journals/${journalId}/approve`, data);
  return res.data.data;
}

export async function rejectJournal(organisationId: string, journalId: string, data: { comments: string }) {
  const res = await api.post(`/organisations/${organisationId}/journals/${journalId}/reject`, data);
  return res.data.data;
}

export async function postJournal(organisationId: string, journalId: string) {
  const res = await api.post(`/organisations/${organisationId}/journals/${journalId}/post`);
  return res.data.data;
}

export async function reverseJournal(organisationId: string, journalId: string, data: { reverseDate: string; periodId: string; description?: string }) {
  const res = await api.post(`/organisations/${organisationId}/journals/${journalId}/reverse`, data);
  return res.data.data as JournalEntry;
}
