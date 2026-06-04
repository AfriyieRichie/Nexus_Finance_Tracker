import { Router } from 'express';
import multer from 'multer';
import { UserRole } from '@prisma/client';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import * as ctrl from './attachments.controller';

// Files are held in memory then stored in Postgres; cap at 15 MB.
const fileUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const router = Router({ mergeParams: true });
router.use(requireAuth);

router.get('/',              requireRole(UserRole.REPORT_VIEWER), ctrl.list);
router.post('/',             requireRole(UserRole.ACCOUNTANT),    fileUpload.single('file'), ctrl.upload);
router.get('/:id/download',  requireRole(UserRole.REPORT_VIEWER), ctrl.download);
router.delete('/:id',        requireRole(UserRole.ACCOUNTANT),    ctrl.remove);

export { router as attachmentsRouter };
