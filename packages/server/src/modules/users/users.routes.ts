import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import * as ctrl from './users.controller';

const router = Router({ mergeParams: true });

router.use(requireAuth);
router.use(requireRole('ORG_ADMIN'));

router.get('/', ctrl.listUsers);
router.post('/', ctrl.createUser);
router.patch('/:userId/role', ctrl.updateRole);
router.patch('/:userId/status', ctrl.updateStatus);
router.post('/:userId/reset-password', ctrl.resetPassword);
router.post('/:userId/unlock', ctrl.unlockUser);

export { router as usersRouter };
