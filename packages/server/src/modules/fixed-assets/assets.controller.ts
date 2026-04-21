import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendCreated, sendPaginated, buildPagination } from '../../utils/response';
import { createAssetSchema, updateAssetSchema, listAssetsSchema, runDepreciationSchema, disposeAssetSchema } from './assets.schemas';
import * as svc from './assets.service';

export const createAsset = asyncHandler(async (req: Request, res: Response) => {
  const input = createAssetSchema.parse(req.body);
  return sendCreated(res, await svc.createAsset(req.params.organisationId, input), 'Asset created');
});

export const updateAsset = asyncHandler(async (req: Request, res: Response) => {
  const input = updateAssetSchema.parse(req.body);
  return sendSuccess(res, await svc.updateAsset(req.params.organisationId, req.params.assetId, input), 'Asset updated');
});

export const listAssets = asyncHandler(async (req: Request, res: Response) => {
  const query = listAssetsSchema.parse(req.query);
  const { assets, total, page, pageSize } = await svc.listAssets(req.params.organisationId, query);
  return sendPaginated(res, assets, buildPagination(page, pageSize, total));
});

export const getAsset = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await svc.getAsset(req.params.organisationId, req.params.assetId));
});

export const runDepreciation = asyncHandler(async (req: Request, res: Response) => {
  const input = runDepreciationSchema.parse(req.body);
  return sendSuccess(res, await svc.runDepreciation(req.params.organisationId, req.user!.sub, input), 'Depreciation run completed');
});

export const disposeAsset = asyncHandler(async (req: Request, res: Response) => {
  const input = disposeAssetSchema.parse(req.body);
  return sendSuccess(res, await svc.disposeAsset(req.params.organisationId, req.params.assetId, req.user!.sub, input), 'Asset disposed');
});
