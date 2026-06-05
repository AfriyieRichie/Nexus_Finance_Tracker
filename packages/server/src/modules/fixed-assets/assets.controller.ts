import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendCreated, sendPaginated, buildPagination } from '../../utils/response';
import {
  createAssetSchema, updateAssetSchema, listAssetsSchema,
  runDepreciationSchema, reverseDepreciationSchema,
  disposeAssetSchema, revalueAssetSchema, impairAssetSchema,
  createCategorySchema, updateCategorySchema, bulkCreateAssetsSchema,
  setAssetStatusSchema, reverseImpairmentSchema, depreciationScheduleSchema,
  capitaliseFromClearingSchema,
} from './assets.schemas';
import * as svc from './assets.service';

export const listCategories = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await svc.listCategories(req.params.organisationId));
});

export const createCategory = asyncHandler(async (req: Request, res: Response) => {
  const input = createCategorySchema.parse(req.body);
  return sendCreated(res, await svc.createCategory(req.params.organisationId, input), 'Category created');
});

export const updateCategory = asyncHandler(async (req: Request, res: Response) => {
  const input = updateCategorySchema.parse(req.body);
  return sendSuccess(res, await svc.updateCategory(req.params.organisationId, req.params.categoryId, input), 'Category updated');
});

export const createAsset = asyncHandler(async (req: Request, res: Response) => {
  const input = createAssetSchema.parse(req.body);
  return sendCreated(res, await svc.createAsset(req.params.organisationId, input, req.user?.sub), 'Asset created');
});

export const listPendingCapitalisations = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await svc.listPendingCapitalisations(req.params.organisationId));
});

export const capitaliseFromClearing = asyncHandler(async (req: Request, res: Response) => {
  const input = capitaliseFromClearingSchema.parse(req.body);
  return sendCreated(res, await svc.capitaliseFromClearing(req.params.organisationId, input, req.user!.sub), 'Asset capitalised');
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

export const getAssetRegister = asyncHandler(async (req: Request, res: Response) => {
  const query = listAssetsSchema.parse(req.query);
  return sendSuccess(res, await svc.getAssetRegister(req.params.organisationId, query));
});

export const getAsset = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await svc.getAsset(req.params.organisationId, req.params.assetId));
});

export const runDepreciation = asyncHandler(async (req: Request, res: Response) => {
  const input = runDepreciationSchema.parse(req.body);
  const result = await svc.runDepreciation(req.params.organisationId, req.user!.sub, input);
  const message = input.preview ? 'Depreciation preview calculated' : 'Depreciation run completed';
  return sendSuccess(res, result, message);
});

export const reverseDepreciation = asyncHandler(async (req: Request, res: Response) => {
  const input = reverseDepreciationSchema.parse(req.body);
  return sendSuccess(res, await svc.reverseDepreciation(req.params.organisationId, req.user!.sub, input), 'Depreciation run reversed');
});

export const listDepreciationRuns = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await svc.listDepreciationRuns(req.params.organisationId));
});

export const disposeAsset = asyncHandler(async (req: Request, res: Response) => {
  const input = disposeAssetSchema.parse(req.body);
  return sendSuccess(res, await svc.disposeAsset(req.params.organisationId, req.params.assetId, req.user!.sub, input), 'Asset disposed');
});

export const revalueAsset = asyncHandler(async (req: Request, res: Response) => {
  const input = revalueAssetSchema.parse(req.body);
  return sendSuccess(res, await svc.revalueAsset(req.params.organisationId, req.params.assetId, req.user!.sub, input), 'Asset revalued');
});

export const impairAsset = asyncHandler(async (req: Request, res: Response) => {
  const input = impairAssetSchema.parse(req.body);
  return sendSuccess(res, await svc.impairAsset(req.params.organisationId, req.params.assetId, req.user!.sub, input), 'Asset impairment recorded');
});

export const setAssetStatus = asyncHandler(async (req: Request, res: Response) => {
  const input = setAssetStatusSchema.parse(req.body);
  const asset = await svc.setAssetStatus(req.params.organisationId, req.params.assetId, input);
  const message = input.status === 'INACTIVE' ? 'Asset marked inactive — depreciation suspended' : 'Asset reactivated — depreciation will resume on next run';
  return sendSuccess(res, asset, message);
});

export const bulkCreateAssets = asyncHandler(async (req: Request, res: Response) => {
  const input = bulkCreateAssetsSchema.parse(req.body);
  const result = await svc.bulkCreateAssets(req.params.organisationId, input);
  return sendCreated(res, result, `${result.created} assets imported successfully`);
});

export const reverseImpairment = asyncHandler(async (req: Request, res: Response) => {
  const input = reverseImpairmentSchema.parse(req.body);
  return sendSuccess(res, await svc.reverseImpairment(req.params.organisationId, req.params.assetId, req.user!.sub, input), 'Impairment reversal recorded');
});

export const getDepreciationSchedule = asyncHandler(async (req: Request, res: Response) => {
  const query = depreciationScheduleSchema.parse(req.query);
  return sendSuccess(res, await svc.getDepreciationSchedule(req.params.organisationId, req.params.assetId, query));
});
