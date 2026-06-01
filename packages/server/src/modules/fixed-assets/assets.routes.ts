import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import * as ctrl from './assets.controller';

const router = Router({ mergeParams: true });
router.use(requireAuth);

// Categories
router.get('/categories', requireRole(UserRole.REPORT_VIEWER), ctrl.listCategories);
router.post('/categories', requireRole(UserRole.FINANCE_MANAGER), ctrl.createCategory);
router.put('/categories/:categoryId', requireRole(UserRole.FINANCE_MANAGER), ctrl.updateCategory);

// Depreciation
router.post('/depreciation/run', requireRole(UserRole.FINANCE_MANAGER), ctrl.runDepreciation);
router.post('/depreciation/reverse', requireRole(UserRole.FINANCE_MANAGER), ctrl.reverseDepreciation);
router.get('/depreciation/runs', requireRole(UserRole.REPORT_VIEWER), ctrl.listDepreciationRuns);

// Assets
router.get('/', requireRole(UserRole.REPORT_VIEWER), ctrl.listAssets);
router.post('/', requireRole(UserRole.FINANCE_MANAGER), ctrl.createAsset);
router.post('/bulk', requireRole(UserRole.FINANCE_MANAGER), ctrl.bulkCreateAssets);
router.get('/:assetId', requireRole(UserRole.REPORT_VIEWER), ctrl.getAsset);
router.put('/:assetId', requireRole(UserRole.FINANCE_MANAGER), ctrl.updateAsset);
router.post('/:assetId/dispose', requireRole(UserRole.FINANCE_MANAGER), ctrl.disposeAsset);
router.post('/:assetId/revalue', requireRole(UserRole.FINANCE_MANAGER), ctrl.revalueAsset);
router.post('/:assetId/impair', requireRole(UserRole.FINANCE_MANAGER), ctrl.impairAsset);
router.patch('/:assetId/status', requireRole(UserRole.FINANCE_MANAGER), ctrl.setAssetStatus);

export { router as assetsRouter };
