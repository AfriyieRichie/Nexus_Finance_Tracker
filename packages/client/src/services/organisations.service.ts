import { api } from './api';

export async function createOrganisation(data: {
  name: string;
  baseCurrency: string;
  country?: string;
  taxId?: string;
}) {
  const res = await api.post('/organisations', data);
  return res.data.data;
}

export async function getMyOrganisations() {
  const res = await api.get('/organisations/my');
  return res.data.data;
}
