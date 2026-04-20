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
  data: {
    entries: JournalEntry[];
    total: number;
    page: number;
    pageSize: number;
  };
}

export async function listJournals(
  organisationId: string,
  params?: { status?: string; page?: number; pageSize?: number },
) {
  const res = await api.get<JournalsResponse>(`/organisations/${organisationId}/journals`, {
    params: { pageSize: 20, ...params },
  });
  return res.data.data;
}

export async function getJournal(organisationId: string, journalId: string) {
  const res = await api.get(`/organisations/${organisationId}/journals/${journalId}`);
  return res.data.data as JournalEntry;
}
