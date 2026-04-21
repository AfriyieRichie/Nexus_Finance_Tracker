import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import * as ctrl from './assets.controller';

const router = Router({ mergeParams: true });
router.use(requireAuth);

router.get('/', ctrl.listAssets);
router.post('/', ctrl.createAsset);
router.get('/:assetId', ctrl.getAsset);
router.put('/:assetId', ctrl.updateAsset);
router.post('/:assetId/dispose', ctrl.disposeAsset);
router.post('/depreciation/run', ctrl.runDepreciation);

export { router as assetsRouter };
