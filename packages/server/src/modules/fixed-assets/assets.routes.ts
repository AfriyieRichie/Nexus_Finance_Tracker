import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import * as ctrl from './assets.controller';

const router = Router({ mergeParams: true });
router.use(requireAuth);

// Categories
router.get('/categories', ctrl.listCategories);
router.post('/categories', ctrl.createCategory);
router.put('/categories/:categoryId', ctrl.updateCategory);

// Depreciation
router.post('/depreciation/run', ctrl.runDepreciation);
router.post('/depreciation/reverse', ctrl.reverseDepreciation);
router.get('/depreciation/runs', ctrl.listDepreciationRuns);

// Assets
router.get('/', ctrl.listAssets);
router.post('/', ctrl.createAsset);
router.post('/bulk', ctrl.bulkCreateAssets);
router.get('/:assetId', ctrl.getAsset);
router.put('/:assetId', ctrl.updateAsset);
router.post('/:assetId/dispose', ctrl.disposeAsset);
router.post('/:assetId/revalue', ctrl.revalueAsset);
router.post('/:assetId/impair', ctrl.impairAsset);
router.patch('/:assetId/status', ctrl.setAssetStatus);

export { router as assetsRouter };
