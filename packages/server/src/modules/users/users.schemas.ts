import { z } from 'zod';
import { UserRole } from '@prisma/client';

export const createUserSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  firstName: z.string().min(1).max(100).trim(),
  lastName: z.string().min(1).max(100).trim(),
  jobTitle: z.string().max(200).trim().optional(),
  role: z.nativeEnum(UserRole).default(UserRole.ACCOUNTANT),
  temporaryPassword: z.string().min(8).max(100),
});

export const updateUserRoleSchema = z.object({
  role: z.nativeEnum(UserRole),
});

export const updateUserStatusSchema = z.object({
  isActive: z.boolean(),
});

export const adminResetPasswordSchema = z.object({
  newPassword: z.string().min(8).max(100),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserRoleInput = z.infer<typeof updateUserRoleSchema>;
export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>;
export type AdminResetPasswordInput = z.infer<typeof adminResetPasswordSchema>;
