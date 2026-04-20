import { Router } from 'express';
import { authRateLimiter } from '../../middleware/rateLimiter.middleware';
import { requireAuth } from '../../middleware/auth.middleware';
import * as authController from './auth.controller';

export const authRouter = Router();

// Public routes (rate limited)
authRouter.post('/register', authRateLimiter, authController.register);
authRouter.post('/login', authRateLimiter, authController.login);
authRouter.post('/refresh', authRateLimiter, authController.refresh);
authRouter.post('/logout', authController.logout);

// Protected routes
authRouter.get('/me', requireAuth, authController.getMe);
authRouter.post('/logout-all', requireAuth, authController.logoutAll);
authRouter.post('/change-password', requireAuth, authController.changePassword);
