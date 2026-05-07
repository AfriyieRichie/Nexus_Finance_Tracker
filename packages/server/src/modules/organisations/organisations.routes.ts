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
