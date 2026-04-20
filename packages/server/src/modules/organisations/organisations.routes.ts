import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import * as orgController from './organisations.controller';

export const organisationsRouter = Router();

// All routes require authentication
organisationsRouter.use(requireAuth);

// My organisations
organisationsRouter.get('/my', orgController.getMyOrganisations);

// Create organisation (any authenticated user)
organisationsRouter.post('/', orgController.create);

// Organisation-scoped routes
organisationsRouter.get(
  '/:organisationId',
  orgController.getById,
);

organisationsRouter.patch(
  '/:organisationId',
  requireRole(UserRole.ORG_ADMIN),
  orgController.update,
);

// User management within organisation
organisationsRouter.get(
  '/:organisationId/users',
  requireRole(UserRole.FINANCE_MANAGER),
  orgController.listUsers,
);

organisationsRouter.post(
  '/:organisationId/users',
  requireRole(UserRole.ORG_ADMIN),
  orgController.inviteUser,
);

organisationsRouter.patch(
  '/:organisationId/users/:userId/role',
  requireRole(UserRole.ORG_ADMIN),
  orgController.updateUserRole,
);

organisationsRouter.delete(
  '/:organisationId/users/:userId',
  requireRole(UserRole.ORG_ADMIN),
  orgController.removeUser,
);
