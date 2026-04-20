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
