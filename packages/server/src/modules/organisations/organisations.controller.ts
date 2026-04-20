import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendCreated, sendPaginated } from '../../utils/response';
import { paginationSchema } from '../../utils/pagination';
import type { AuthenticatedRequest } from '../../middleware/auth.middleware';
import {
  createOrganisationSchema,
  updateOrganisationSchema,
  inviteUserSchema,
  updateUserRoleSchema,
} from './organisations.schemas';
import * as orgService from './organisations.service';

export const create = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as AuthenticatedRequest).user;
  const input = createOrganisationSchema.parse(req.body);
  const org = await orgService.createOrganisation(input, user.sub);
  return sendCreated(res, org, 'Organisation created successfully');
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as AuthenticatedRequest).user;
  const org = await orgService.getOrganisation(
    req.params.organisationId,
    user.sub,
    user.isSuperAdmin,
  );
  return sendSuccess(res, org);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const input = updateOrganisationSchema.parse(req.body);
  const org = await orgService.updateOrganisation(req.params.organisationId, input);
  return sendSuccess(res, org, 'Organisation updated');
});

export const listUsers = asyncHandler(async (req: Request, res: Response) => {
  const { page, pageSize } = paginationSchema.parse(req.query);
  const { users, pagination } = await orgService.listOrganisationUsers(
    req.params.organisationId,
    page,
    pageSize,
  );
  return sendPaginated(res, users, pagination);
});

export const inviteUser = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as AuthenticatedRequest).user;
  const input = inviteUserSchema.parse(req.body);
  const result = await orgService.inviteUser(req.params.organisationId, input, user.sub);
  return sendCreated(res, result, 'User invited successfully');
});

export const updateUserRole = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as AuthenticatedRequest).user;
  const input = updateUserRoleSchema.parse(req.body);
  const result = await orgService.updateUserRole(
    req.params.organisationId,
    req.params.userId,
    input,
    user.sub,
  );
  return sendSuccess(res, result, 'Role updated successfully');
});

export const removeUser = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as AuthenticatedRequest).user;
  await orgService.removeUser(req.params.organisationId, req.params.userId, user.sub);
  return sendSuccess(res, null, 'User removed from organisation');
});

export const getMyOrganisations = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as AuthenticatedRequest).user;
  const { page, pageSize } = paginationSchema.parse(req.query);
  const { organisations, pagination } = await orgService.getUserOrganisations(
    user.sub,
    page,
    pageSize,
  );
  return sendPaginated(res, organisations, pagination);
});
