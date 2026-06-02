import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/response';
import { getDashboard } from './dashboard.service';

export const getDashboardData = asyncHandler(async (req: Request, res: Response) => {
  const { organisationId } = req.params;
  const userId = req.user!.sub;
  const data = await getDashboard(organisationId, userId);
  return sendSuccess(res, data);
});
