import { api } from './api';
import type { UserRole } from './users.types';

export type { UserRole };

export interface OrgUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  jobTitle?: string;
  isActive: boolean;
  isSuperAdmin: boolean;
  mustChangePassword: boolean;
  lockedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  role: UserRole;
  orgIsActive: boolean;
  joinedAt: string | null;
}

export async function listOrgUsers(organisationId: string) {
  const res = await api.get(`/organisations/${organisationId}/users`);
  return res.data.data as OrgUser[];
}

export interface CreatedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  temporaryPassword?: string; // only present for brand-new users (not existing users added to org)
}

export async function createOrgUser(organisationId: string, data: {
  email: string;
  firstName: string;
  lastName: string;
  jobTitle?: string;
  role: UserRole;
}) {
  const res = await api.post(`/organisations/${organisationId}/users`, data);
  return res.data.data as CreatedUser;
}

export async function updateUserRole(organisationId: string, userId: string, role: UserRole) {
  const res = await api.patch(`/organisations/${organisationId}/users/${userId}/role`, { role });
  return res.data.data;
}

export async function setUserStatus(organisationId: string, userId: string, isActive: boolean) {
  const res = await api.patch(`/organisations/${organisationId}/users/${userId}/status`, { isActive });
  return res.data.data;
}

export interface ResetPasswordResult {
  userId: string;
  mustChangePassword: boolean;
  temporaryPassword: string;
}

export async function adminResetPassword(organisationId: string, userId: string) {
  const res = await api.post(`/organisations/${organisationId}/users/${userId}/reset-password`);
  return res.data.data as ResetPasswordResult;
}

export async function unlockUser(organisationId: string, userId: string) {
  const res = await api.post(`/organisations/${organisationId}/users/${userId}/unlock`);
  return res.data.data;
}
