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

export interface OrgUser {
  userId: string;
  role: string;
  isActive: boolean;
  user: { id: string; firstName: string; lastName: string; email: string };
}

export async function listOrgUsers(organisationId: string) {
  const res = await api.get(`/organisations/${organisationId}/users`);
  return res.data.data as OrgUser[];
}
