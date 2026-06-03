import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { UserRole } from '@prisma/client';
import { prisma } from '../../config/database';
import { ConflictError, NotFoundError, ForbiddenError } from '../../utils/errors';
import { auditLog } from '../audit-trail/audit.service';
import type { CreateUserInput } from './users.schemas';

const BCRYPT_ROUNDS = 12;

// Generates a secure temporary password that satisfies common policies:
// "Nx!" prefix (uppercase, lowercase, special) + 12 URL-safe base64 chars (mixed case + digits).
// Returned to the caller once in plaintext — never stored; user must change on first login.
function generateTemporaryPassword(): string {
  return `Nx!${crypto.randomBytes(9).toString('base64url')}`;
}

export async function listOrgUsers(organisationId: string) {
  const orgUsers = await prisma.organisationUser.findMany({
    where: { organisationId },
    select: {
      role: true,
      isActive: true,
      joinedAt: true,
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          jobTitle: true,
          isActive: true,
          isSuperAdmin: true,
          mustChangePassword: true,
          lockedAt: true,
          lastLoginAt: true,
          createdAt: true,
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

export async function getOrgUser(organisationId: string, userId: string) {
  const orgUser = await prisma.organisationUser.findUnique({
    where: { organisationId_userId: { organisationId, userId } },
    select: {
      role: true, isActive: true, joinedAt: true,
      user: {
        select: {
          id: true, email: true, firstName: true, lastName: true, jobTitle: true,
          isActive: true, isSuperAdmin: true, mustChangePassword: true,
          lockedAt: true, lastLoginAt: true, createdAt: true,
        },
      },
    },
  });
  if (!orgUser) throw new NotFoundError('User not found in this organisation');
  return { ...orgUser.user!, role: orgUser.role, orgIsActive: orgUser.isActive, joinedAt: orgUser.joinedAt };
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

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_ROUNDS);

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

  // temporaryPassword returned once in plaintext — never stored. Admin must share it securely.
  return { ...user, temporaryPassword };
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

  // Keep the global login flag (User.isActive — the one checked at login) in sync
  // with the organisation membership, so reactivating actually restores access.
  if (isActive) {
    // Re-enabling membership must re-enable the login account.
    await prisma.user.update({ where: { id: userId }, data: { isActive: true } });
  } else {
    // Disable the login account only when the user has no OTHER active org membership
    // (a user may belong to several organisations).
    const otherActive = await prisma.organisationUser.count({
      where: { userId, isActive: true, NOT: { organisationId } },
    });
    if (otherActive === 0) {
      await prisma.user.update({ where: { id: userId }, data: { isActive: false } });
    }
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
  requesterId: string,
) {
  if (userId === requesterId) throw new ForbiddenError('Use Change Password to update your own password');

  const orgUser = await prisma.organisationUser.findUnique({
    where: { organisationId_userId: { organisationId, userId } },
    include: { user: { select: { email: true } } },
  });
  if (!orgUser) throw new NotFoundError('User not found in this organisation');

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_ROUNDS);

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

  // temporaryPassword returned once in plaintext — never stored. Admin must share it securely.
  return { userId, mustChangePassword: true, temporaryPassword };
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
