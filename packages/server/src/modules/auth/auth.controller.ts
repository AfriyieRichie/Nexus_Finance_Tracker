import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendCreated } from '../../utils/response';
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  changePasswordSchema,
} from './auth.schemas';
import * as authService from './auth.service';

export const register = asyncHandler(async (req: Request, res: Response) => {
  const input = registerSchema.parse(req.body);
  const result = await authService.register(input, req.ip, req.headers['user-agent']);
  return sendCreated(res, result, 'Account created successfully');
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const input = loginSchema.parse(req.body);
  const result = await authService.login(input, req.ip, req.headers['user-agent']);
  return sendSuccess(res, result, 'Login successful');
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = refreshTokenSchema.parse(req.body);
  const tokens = await authService.refreshTokens(
    refreshToken,
    req.ip,
    req.headers['user-agent'],
  );
  return sendSuccess(res, tokens, 'Tokens refreshed');
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = refreshTokenSchema.parse(req.body);
  await authService.logout(refreshToken);
  return sendSuccess(res, null, 'Logged out successfully');
});

export const logoutAll = asyncHandler(async (req: Request, res: Response) => {
  await authService.logoutAll(req.user!.sub);
  return sendSuccess(res, null, 'All sessions terminated');
});

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const profile = await authService.getMe(req.user!.sub);
  return sendSuccess(res, profile);
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const input = changePasswordSchema.parse(req.body);
  await authService.changePassword(req.user!.sub, input);
  return sendSuccess(res, null, 'Password changed successfully. Please log in again.');
});
