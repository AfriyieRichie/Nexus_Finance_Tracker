import { api } from './api';

export interface AccountingPeriod {
  id: string;
  fiscalYear: number;
  periodNumber: number;
  name: string;
  startDate: string;
  endDate: string;
  status: 'OPEN' | 'CLOSED' | 'LOCKED';
}

export async function listPeriods(organisationId: string) {
  const res = await api.get(`/organisations/${organisationId}/periods`);
  return res.data.data as AccountingPeriod[];
}

export async function createFiscalYear(organisationId: string, data: {
  fiscalYear: number;
  startDate: string;
  currency?: string;
}) {
  const res = await api.post(`/organisations/${organisationId}/periods`, data);
  return res.data.data;
}
