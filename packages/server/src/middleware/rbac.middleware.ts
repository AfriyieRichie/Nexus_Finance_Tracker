import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';
import { ForbiddenError, UnauthorizedError } from '../utils/errors';
import { AuthenticatedRequest } from './auth.middleware';
import { prisma } from '../config/database';

export interface OrgAuthenticatedRequest extends AuthenticatedRequest {
  orgUser: {
    organisationId: string;
    userId: string;
    role: UserRole;
  };
}

const ROLE_HIERARCHY: Record<UserRole, number> = {
  SUPER_ADMIN: 100,
  ORG_ADMIN: 90,
  FINANCE_MANAGER: 70,
  ACCOUNTANT: 50,
  ACCOUNTS_PAYABLE_CLERK: 40,
  ACCOUNTS_RECEIVABLE_CLERK: 40,
  APPROVER: 35,
  AUDITOR: 30,
  REPORT_VIEWER: 20,
};

export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction): void {
  const user = (req as AuthenticatedRequest).user;
  if (!user) throw new UnauthorizedError();
  if (!user.isSuperAdmin) throw new ForbiddenError('Super admin access required');
  next();
}

export function requireRole(...roles: UserRole[]) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const user = (req as AuthenticatedRequest).user;
    if (!user) throw new UnauthorizedError();

    if (user.isSuperAdmin) {
      next();
      return;
    }

    const organisationId = req.params.organisationId ?? req.body?.organisationId as string | undefined;
    if (!organisationId) throw new ForbiddenError('Organisation context required');

    const orgUser = await prisma.organisationUser.findUnique({
      where: {
        organisationId_userId: { organisationId, userId: user.sub },
      },
    });

    if (!orgUser || !orgUser.isActive) {
      throw new ForbiddenError('You do not have access to this organisation');
    }

    const hasRole = roles.some(
      (r) => ROLE_HIERARCHY[orgUser.role] >= ROLE_HIERARCHY[r],
    );

    if (!hasRole) {
      throw new ForbiddenError(
        `Required role: ${roles.join(' or ')}. Your role: ${orgUser.role}`,
      );
    }

    (req as OrgAuthenticatedRequest).orgUser = {
      organisationId,
      userId: user.sub,
      role: orgUser.role,
    };

    next();
  };
}

export function requireOrgAccess(req: Request, _res: Response, next: NextFunction): void {
  const user = (req as AuthenticatedRequest).user;
  if (!user) throw new UnauthorizedError();
  // Super admin bypasses org check
  if (user.isSuperAdmin) {
    next();
    return;
  }
  // requireRole middleware must have already run and attached orgUser
  const orgReq = req as OrgAuthenticatedRequest;
  if (!orgReq.orgUser) throw new ForbiddenError('Organisation access not verified');
  next();
}
