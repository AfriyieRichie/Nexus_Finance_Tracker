import { z } from 'zod';
import { UserRole } from '@prisma/client';

export const createUserSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  firstName: z.string().min(1).max(100).trim(),
  lastName: z.string().min(1).max(100).trim(),
  jobTitle: z.string().max(200).trim().optional(),
  role: z.nativeEnum(UserRole).default(UserRole.ACCOUNTANT),
  // temporaryPassword is intentionally omitted — the system generates it
});

export const updateUserRoleSchema = z.object({
  role: z.nativeEnum(UserRole),
});

export const updateUserStatusSchema = z.object({
  isActive: z.boolean(),
});

// No body needed — system generates the new temporary password
export const adminResetPasswordSchema = z.object({}).optional();

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserRoleInput = z.infer<typeof updateUserRoleSchema>;
export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>;
