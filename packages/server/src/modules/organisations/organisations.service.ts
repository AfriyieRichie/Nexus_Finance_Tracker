import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { UserRole } from '@prisma/client';
import { prisma } from '../../config/database';
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from '../../utils/errors';
import { buildPagination } from '../../utils/response';
import { getPaginationOffset } from '../../utils/pagination';
import type {
  CreateOrganisationInput,
  UpdateOrganisationInput,
  InviteUserInput,
  UpdateUserRoleInput,
} from './organisations.schemas';

export async function createOrganisation(input: CreateOrganisationInput, creatorId: string) {
  return prisma.$transaction(async (tx) => {
    const org = await tx.organisation.create({ data: input });

    // Creator becomes ORG_ADMIN of their organisation
    await tx.organisationUser.create({
      data: {
        organisationId: org.id,
        userId: creatorId,
        role: UserRole.ORG_ADMIN,
        joinedAt: new Date(),
      },
    });

    return org;
  });
}

export async function getOrganisation(organisationId: string, requestingUserId: string, isSuperAdmin: boolean) {
  const org = await prisma.organisation.findUnique({
    where: { id: organisationId },
    include: {
      _count: { select: { organisationUsers: { where: { isActive: true } } } },
    },
  });
  if (!org) throw new NotFoundError('Organisation');

  if (!isSuperAdmin) {
    const membership = await prisma.organisationUser.findUnique({
      where: { organisationId_userId: { organisationId, userId: requestingUserId } },
    });
    if (!membership || !membership.isActive) throw new ForbiddenError();
  }

  return org;
}

export async function updateOrganisation(
  organisationId: string,
  input: UpdateOrganisationInput,
) {
  const org = await prisma.organisation.findUnique({ where: { id: organisationId } });
  if (!org) throw new NotFoundError('Organisation');

  return prisma.organisation.update({ where: { id: organisationId }, data: input });
}

export async function listOrganisationUsers(
  organisationId: string,
  page: number,
  pageSize: number,
) {
  const [users, total] = await Promise.all([
    prisma.organisationUser.findMany({
      where: { organisationId, isActive: true },
      skip: getPaginationOffset(page, pageSize),
      take: pageSize,
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            lastLoginAt: true,
          },
        },
      },
    }),
    prisma.organisationUser.count({ where: { organisationId, isActive: true } }),
  ]);

  return { users, pagination: buildPagination(page, pageSize, total) };
}

export async function inviteUser(
  organisationId: string,
  input: InviteUserInput,
  invitedById: string,
) {
  // Check if user already exists in the system
  let user = await prisma.user.findUnique({ where: { email: input.email } });

  if (!user) {
    // Create a placeholder account — they'll set their password on first login
    const tempPassword = crypto.randomBytes(32).toString('hex');
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        firstName: input.firstName ?? '',
        lastName: input.lastName ?? '',
        isActive: false,
      },
    });
  }

  // Check for existing membership
  const existing = await prisma.organisationUser.findUnique({
    where: { organisationId_userId: { organisationId, userId: user.id } },
  });

  if (existing?.isActive) {
    throw new ConflictError('This user is already a member of the organisation');
  }

  if (existing) {
    // Reactivate with new role
    return prisma.organisationUser.update({
      where: { id: existing.id },
      data: { role: input.role, isActive: true },
    });
  }

  return prisma.organisationUser.create({
    data: {
      organisationId,
      userId: user.id,
      role: input.role,
      invitedAt: new Date(),
    },
  });
}

export async function updateUserRole(
  organisationId: string,
  targetUserId: string,
  input: UpdateUserRoleInput,
  requestingUserId: string,
) {
  if (targetUserId === requestingUserId) {
    throw new ForbiddenError('You cannot change your own role');
  }

  const membership = await prisma.organisationUser.findUnique({
    where: { organisationId_userId: { organisationId, userId: targetUserId } },
  });
  if (!membership || !membership.isActive) throw new NotFoundError('Organisation user');

  return prisma.organisationUser.update({
    where: { id: membership.id },
    data: { role: input.role },
  });
}

export async function removeUser(
  organisationId: string,
  targetUserId: string,
  requestingUserId: string,
) {
  if (targetUserId === requestingUserId) {
    throw new ForbiddenError('You cannot remove yourself from the organisation');
  }

  const membership = await prisma.organisationUser.findUnique({
    where: { organisationId_userId: { organisationId, userId: targetUserId } },
  });
  if (!membership || !membership.isActive) throw new NotFoundError('Organisation user');

  // Soft-remove: deactivate instead of delete to preserve audit trail
  return prisma.organisationUser.update({
    where: { id: membership.id },
    data: { isActive: false },
  });
}

export async function getUserOrganisations(userId: string, page: number, pageSize: number) {
  const [memberships, total] = await Promise.all([
    prisma.organisationUser.findMany({
      where: { userId, isActive: true },
      skip: getPaginationOffset(page, pageSize),
      take: pageSize,
      include: {
        organisation: {
          select: {
            id: true,
            name: true,
            baseCurrency: true,
            industry: true,
            isActive: true,
          },
        },
      },
    }),
    prisma.organisationUser.count({ where: { userId, isActive: true } }),
  ]);

  return {
    organisations: memberships.map((m) => ({ ...m.organisation, role: m.role })),
    pagination: buildPagination(page, pageSize, total),
  };
}
