import { api } from './api';

export interface AccountingPeriod {
  id: string;
  fiscalYear: number;
  periodNumber: number;
  name: string;
  startDate: string;
  endDate: string;
  status: 'OPEN' | 'CLOSED' | 'LOCKED';
  closedBy: string | null;
  closedAt: string | null;
}

export async function listPeriods(organisationId: string, params?: { fiscalYear?: number; status?: string }) {
  const res = await api.get(`/organisations/${organisationId}/periods`, { params });
  return res.data.data as AccountingPeriod[];
}

export async function createFiscalYear(organisationId: string, data: {
  fiscalYear: number;
  startDate: string;
  currency?: string;
}) {
  const res = await api.post(`/organisations/${organisationId}/periods`, data);
  return res.data.data as AccountingPeriod[];
}

export async function closePeriod(organisationId: string, periodId: string) {
  const res = await api.post(`/organisations/${organisationId}/periods/${periodId}/close`);
  return res.data.data as AccountingPeriod;
}

export async function reopenPeriod(organisationId: string, periodId: string, reason: string) {
  const res = await api.post(`/organisations/${organisationId}/periods/${periodId}/reopen`, { reason });
  return res.data.data as AccountingPeriod;
}

export async function lockPeriod(organisationId: string, periodId: string) {
  const res = await api.post(`/organisations/${organisationId}/periods/${periodId}/lock`);
  return res.data.data as AccountingPeriod;
}

export async function yearEndClose(organisationId: string, fiscalYear: number) {
  const res = await api.post(`/organisations/${organisationId}/periods/year-end-close`, { fiscalYear });
  return res.data.data as { locked: number };
}
