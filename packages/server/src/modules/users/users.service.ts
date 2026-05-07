import bcrypt from 'bcryptjs';
import { UserRole } from '@prisma/client';
import { prisma } from '../../config/database';
import { ConflictError, NotFoundError, ForbiddenError } from '../../utils/errors';
import { auditLog } from '../audit-trail/audit.service';
import type { CreateUserInput } from './users.schemas';

const BCRYPT_ROUNDS = 12;

export async function listOrgUsers(organisationId: string) {
  const orgUsers = await prisma.organisationUser.findMany({
    where: { organisationId },
    include: {
      user: {
        select: {
          id: true, email: true, firstName: true, lastName: true,
          jobTitle: true, isActive: true, isSuperAdmin: true,
          mustChangePassword: true, lockedAt: true,
          lastLoginAt: true, createdAt: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return orgUsers
    .filter((ou) => ou.user != null)
    .map((ou) => ({
      ...ou.user!,
      role: ou.role,
      orgIsActive: ou.isActive,
      joinedAt: ou.joinedAt,
    }));
}

export async function createOrgUser(
  organisationId: string,
  input: CreateUserInput,
  createdBy: string,
) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });

  if (existing) {
    const existingMembership = await prisma.organisationUser.findUnique({
      where: { organisationId_userId: { organisationId, userId: existing.id } },
    });
    if (existingMembership) {
      throw new ConflictError('This user is already a member of this organisation');
    }
    await prisma.organisationUser.create({
      data: { organisationId, userId: existing.id, role: input.role, joinedAt: new Date() },
    });
    auditLog({
      organisationId, userId: createdBy,
      action: 'USER_ADDED_TO_ORG', module: 'USER_MANAGEMENT', entityType: 'USER',
      entityId: existing.id,
      description: `Existing user ${existing.email} added to organisation with role ${input.role}`,
    });
    return { id: existing.id, email: existing.email, firstName: existing.firstName, lastName: existing.lastName };
  }

  const passwordHash = await bcrypt.hash(input.temporaryPassword, BCRYPT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      jobTitle: input.jobTitle ?? null,
      mustChangePassword: true,
      organisationUsers: {
        create: { organisationId, role: input.role, joinedAt: new Date() },
      },
    },
    select: { id: true, email: true, firstName: true, lastName: true },
  });

  auditLog({
    organisationId, userId: createdBy,
    action: 'USER_CREATED', module: 'USER_MANAGEMENT', entityType: 'USER',
    entityId: user.id,
    description: `User ${user.email} created with role ${input.role}`,
  });

  return user;
}

export async function updateUserRole(
  organisationId: string,
  userId: string,
  role: UserRole,
  requesterId: string,
) {
  if (userId === requesterId) throw new ForbiddenError('You cannot change your own role');

  const orgUser = await prisma.organisationUser.findUnique({
    where: { organisationId_userId: { organisationId, userId } },
    include: { user: { select: { email: true } } },
  });
  if (!orgUser) throw new NotFoundError('User not found in this organisation');

  const updated = await prisma.organisationUser.update({
    where: { organisationId_userId: { organisationId, userId } },
    data: { role },
    include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
  });

  auditLog({
    organisationId, userId: requesterId,
    action: 'USER_ROLE_CHANGED', module: 'USER_MANAGEMENT', entityType: 'USER',
    entityId: userId,
    description: `Role changed to ${role} for ${orgUser.user.email}`,
    before: { role: orgUser.role }, after: { role },
  });

  return updated;
}

export async function setUserStatus(
  organisationId: string,
  userId: string,
  isActive: boolean,
  requesterId: string,
) {
  if (userId === requesterId) throw new ForbiddenError('You cannot deactivate your own account');

  const orgUser = await prisma.organisationUser.findUnique({
    where: { organisationId_userId: { organisationId, userId } },
    include: { user: { select: { email: true } } },
  });
  if (!orgUser) throw new NotFoundError('User not found in this organisation');

  await prisma.organisationUser.update({
    where: { organisationId_userId: { organisationId, userId } },
    data: { isActive },
  });

  if (!isActive) {
    await prisma.refreshToken.updateMany({ where: { userId }, data: { isRevoked: true } });
  }

  auditLog({
    organisationId, userId: requesterId,
    action: isActive ? 'USER_REACTIVATED' : 'USER_DEACTIVATED',
    module: 'USER_MANAGEMENT', entityType: 'USER', entityId: userId,
    description: `User ${orgUser.user.email} ${isActive ? 'reactivated' : 'deactivated'}`,
  });

  return { userId, isActive };
}

export async function adminResetPassword(
  organisationId: string,
  userId: string,
  newPassword: string,
  requesterId: string,
) {
  if (userId === requesterId) throw new ForbiddenError('Use Change Password to update your own password');

  const orgUser = await prisma.organisationUser.findUnique({
    where: { organisationId_userId: { organisationId, userId } },
    include: { user: { select: { email: true } } },
  });
  if (!orgUser) throw new NotFoundError('User not found in this organisation');

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: true, failedLoginAttempts: 0, lockedAt: null },
    }),
    prisma.refreshToken.updateMany({ where: { userId }, data: { isRevoked: true } }),
  ]);

  auditLog({
    organisationId, userId: requesterId,
    action: 'USER_PASSWORD_RESET', module: 'USER_MANAGEMENT', entityType: 'USER',
    entityId: userId,
    description: `Admin reset password for ${orgUser.user.email}`,
  });

  return { userId, mustChangePassword: true };
}

export async function unlockUser(
  organisationId: string,
  userId: string,
  requesterId: string,
) {
  const orgUser = await prisma.organisationUser.findUnique({
    where: { organisationId_userId: { organisationId, userId } },
    include: { user: { select: { email: true } } },
  });
  if (!orgUser) throw new NotFoundError('User not found in this organisation');

  await prisma.user.update({
    where: { id: userId },
    data: { failedLoginAttempts: 0, lockedAt: null },
  });

  auditLog({
    organisationId, userId: requesterId,
    action: 'USER_UNLOCKED', module: 'USER_MANAGEMENT', entityType: 'USER',
    entityId: userId,
    description: `Admin unlocked account for ${orgUser.user.email}`,
  });

  return { userId, locked: false };
}
