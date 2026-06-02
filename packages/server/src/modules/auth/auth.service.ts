import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../../config/database';
import { config } from '../../config';
import {
  ConflictError,
  UnauthorizedError,
  NotFoundError,
} from '../../utils/errors';
import type { RegisterInput, LoginInput, ChangePasswordInput } from './auth.schemas';
import type { TokenPair } from './auth.types';
import type { JwtPayload } from '../../middleware/auth.middleware';
import { auditLog } from '../audit-trail/audit.service';

const BCRYPT_ROUNDS = 12;
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function generateTokenPair(
  userId: string,
  email: string,
  isSuperAdmin: boolean,
  ipAddress?: string,
  userAgent?: string,
): Promise<TokenPair> {
  const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
    sub: userId,
    email,
    isSuperAdmin,
  };

  const accessToken = jwt.sign(payload, config.JWT_ACCESS_SECRET, {
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  });

  const rawRefreshToken = crypto.randomBytes(64).toString('hex');
  const tokenHash = hashToken(rawRefreshToken);

  const refreshExpiry = new Date();
  refreshExpiry.setDate(refreshExpiry.getDate() + 7);

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt: refreshExpiry,
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    },
  });

  return {
    accessToken,
    refreshToken: rawRefreshToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  };
}

export async function register(
  input: RegisterInput,
  ipAddress?: string,
  userAgent?: string,
): Promise<{ user: { id: string; email: string }; tokens: TokenPair }> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new ConflictError('An account with this email already exists');

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
    },
    select: { id: true, email: true, firstName: true, lastName: true },
  });

  const tokens = await generateTokenPair(user.id, user.email, false, ipAddress, userAgent);

  return { user: { id: user.id, email: user.email }, tokens };
}

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 30;

export async function login(
  input: LoginInput,
  ipAddress?: string,
  userAgent?: string,
): Promise<{ user: { id: string; email: string; firstName: string; lastName: string; mustChangePassword: boolean }; tokens: TokenPair }> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: {
      id: true, email: true, firstName: true, lastName: true,
      passwordHash: true, isActive: true, isSuperAdmin: true,
      mustChangePassword: true, failedLoginAttempts: true, lockedAt: true,
    },
  });

  // Constant-time comparison to prevent timing attacks
  const dummyHash = '$2b$12$invalidhashinvalidhashinvalidhashinvalidhashXXXXXXXXXXXXX';
  const passwordValid = await bcrypt.compare(input.password, user?.passwordHash ?? dummyHash);

  if (!user || !passwordValid) {
    if (user) {
      const newCount = user.failedLoginAttempts + 1;
      const shouldLock = newCount >= MAX_FAILED_ATTEMPTS;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: newCount,
          lockedAt: shouldLock ? new Date() : user.lockedAt,
        },
      });
      if (shouldLock) {
        auditLog({
          userId: user.id, action: 'ACCOUNT_LOCKED', module: 'AUTH', entityType: 'USER',
          entityId: user.id, description: `Account locked after ${MAX_FAILED_ATTEMPTS} failed attempts`, ipAddress, userAgent,
        });
      }
    }
    auditLog({
      action: 'LOGIN_FAILED', module: 'AUTH', entityType: 'USER',
      description: `Failed login attempt for ${input.email}`, ipAddress, userAgent,
    });
    throw new UnauthorizedError('Invalid email or password');
  }

  if (!user.isActive) {
    throw new UnauthorizedError('Your account has been deactivated. Contact your administrator.');
  }

  if (user.lockedAt) {
    const lockExpiry = new Date(user.lockedAt.getTime() + LOCKOUT_MINUTES * 60 * 1000);
    if (new Date() < lockExpiry) {
      const minutesLeft = Math.ceil((lockExpiry.getTime() - Date.now()) / 60000);
      throw new UnauthorizedError(
        `Account locked due to too many failed login attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'} or contact your administrator.`,
      );
    }
    // Lock window expired — auto-unlock
    await prisma.user.update({ where: { id: user.id }, data: { lockedAt: null, failedLoginAttempts: 0 } });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date(), failedLoginAttempts: 0 },
  });

  const tokens = await generateTokenPair(user.id, user.email, user.isSuperAdmin, ipAddress, userAgent);

  auditLog({
    userId: user.id, action: 'LOGIN', module: 'AUTH', entityType: 'USER',
    entityId: user.id, description: `User ${user.email} logged in`, ipAddress, userAgent,
  });

  return {
    user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, mustChangePassword: user.mustChangePassword },
    tokens,
  };
}

export async function refreshTokens(
  rawRefreshToken: string,
  ipAddress?: string,
  userAgent?: string,
): Promise<TokenPair> {
  const tokenHash = hashToken(rawRefreshToken);

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: {
      user: {
        select: { id: true, email: true, isSuperAdmin: true, isActive: true },
      },
    },
  });

  if (!stored || stored.isRevoked || stored.expiresAt < new Date()) {
    // Revoke all tokens for this user if token is compromised (reuse detection)
    if (stored && !stored.isRevoked) {
      await prisma.refreshToken.updateMany({
        where: { userId: stored.userId },
        data: { isRevoked: true },
      });
    }
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  if (!stored.user.isActive) {
    throw new UnauthorizedError('Account has been deactivated');
  }

  // Token rotation — revoke current token and issue new pair
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { isRevoked: true },
  });

  return generateTokenPair(
    stored.user.id,
    stored.user.email,
    stored.user.isSuperAdmin,
    ipAddress,
    userAgent,
  );
}

export async function logout(rawRefreshToken: string): Promise<void> {
  const tokenHash = hashToken(rawRefreshToken);
  const token = await prisma.refreshToken.findFirst({
    where: { tokenHash },
    select: { userId: true },
  });
  await prisma.refreshToken.updateMany({ where: { tokenHash }, data: { isRevoked: true } });
  if (token?.userId) {
    auditLog({ userId: token.userId, action: 'LOGOUT', module: 'AUTH', entityType: 'USER', entityId: token.userId, description: 'User logged out' });
  }
}

export async function logoutAll(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({ where: { userId }, data: { isRevoked: true } });
  auditLog({ userId, action: 'LOGOUT_ALL', module: 'AUTH', entityType: 'USER', entityId: userId, description: 'All sessions terminated' });
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      jobTitle: true,
      isSuperAdmin: true,
      mustChangePassword: true,
      lastLoginAt: true,
      createdAt: true,
      organisationUsers: {
        where: { isActive: true },
        select: {
          role: true,
          organisation: { select: { id: true, name: true, baseCurrency: true } },
        },
      },
    },
  });

  if (!user) throw new NotFoundError('User');

  return {
    ...user,
    organisations: user.organisationUsers.map((ou) => ({
      organisationId: ou.organisation.id,
      organisationName: ou.organisation.name,
      baseCurrency: ou.organisation.baseCurrency,
      role: ou.role,
    })),
    organisationUsers: undefined,
  };
}

export async function changePassword(
  userId: string,
  input: ChangePasswordInput,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!user) throw new NotFoundError('User');

  const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
  if (!valid) throw new UnauthorizedError('Current password is incorrect');

  const newHash = await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS);
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash: newHash } }),
    prisma.refreshToken.updateMany({ where: { userId }, data: { isRevoked: true } }),
  ]);
  // Use raw SQL for newly-added columns so this works even if Prisma client
  // was generated before the schema migration was applied on the server.
  await prisma.$executeRaw`
    UPDATE users
    SET "mustChangePassword" = false, "failedLoginAttempts" = 0, "lockedAt" = NULL
    WHERE id = ${userId}
  `;

  auditLog({
    userId,
    action: 'PASSWORD_CHANGED', module: 'AUTH', entityType: 'USER',
    entityId: userId,
    description: 'User changed their password — all sessions revoked',
  });
}

export async function cleanupExpiredTokens(): Promise<void> {
  await prisma.refreshToken.deleteMany({
    where: { OR: [{ expiresAt: { lt: new Date() } }, { isRevoked: true }] },
  });
}
