import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendCreated } from '../../utils/response';
import {
  createUserSchema, updateUserRoleSchema, updateUserStatusSchema,
} from './users.schemas';
import * as svc from './users.service';

export const listUsers = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await svc.listOrgUsers(req.params.organisationId));
});

export const getUser = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await svc.getOrgUser(req.params.organisationId, req.params.userId));
});

export const createUser = asyncHandler(async (req: Request, res: Response) => {
  const input = createUserSchema.parse(req.body);
  const user = await svc.createOrgUser(req.params.organisationId, input, req.user!.sub);
  return sendCreated(res, user, 'User created — they must change their password on first login');
});

export const updateRole = asyncHandler(async (req: Request, res: Response) => {
  const { role } = updateUserRoleSchema.parse(req.body);
  const result = await svc.updateUserRole(req.params.organisationId, req.params.userId, role, req.user!.sub);
  return sendSuccess(res, result, 'Role updated');
});

export const updateStatus = asyncHandler(async (req: Request, res: Response) => {
  const { isActive } = updateUserStatusSchema.parse(req.body);
  const result = await svc.setUserStatus(req.params.organisationId, req.params.userId, isActive, req.user!.sub);
  const message = isActive ? 'User reactivated' : 'User deactivated — access revoked immediately';
  return sendSuccess(res, result, message);
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const result = await svc.adminResetPassword(req.params.organisationId, req.params.userId, req.user!.sub);
  return sendSuccess(res, result, 'Password reset — share the temporary password with the user securely');
});

export const unlockUser = asyncHandler(async (req: Request, res: Response) => {
  const result = await svc.unlockUser(req.params.organisationId, req.params.userId, req.user!.sub);
  return sendSuccess(res, result, 'Account unlocked');
});
