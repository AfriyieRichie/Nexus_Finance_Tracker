import { z } from 'zod';
import { UserRole } from '@prisma/client';

export const createOrganisationSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  legalName: z.string().max(200).trim().optional(),
  registrationNo: z.string().max(100).trim().optional(),
  taxId: z.string().max(100).trim().optional(),
  baseCurrency: z.string().length(3).toUpperCase().default('USD'),
  fiscalYearStart: z.number().int().min(1).max(12).default(1),
  industry: z.string().max(100).optional(),
  phone: z.string().max(50).optional(),
  email: z.string().email().optional(),
  website: z.string().url().optional(),
  address: z
    .object({
      line1: z.string().optional(),
      line2: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      postalCode: z.string().optional(),
      country: z.string().optional(),
    })
    .optional(),
});

export const updateOrganisationSchema = createOrganisationSchema.partial();

export const inviteUserSchema = z.object({
  email: z.string().email().toLowerCase(),
  role: z.nativeEnum(UserRole).refine(
    (r) => r !== UserRole.SUPER_ADMIN,
    'Cannot assign SUPER_ADMIN role via organisation invite',
  ),
  firstName: z.string().min(1).max(100).trim().optional(),
  lastName: z.string().min(1).max(100).trim().optional(),
});

export const updateUserRoleSchema = z.object({
  role: z.nativeEnum(UserRole).refine(
    (r) => r !== UserRole.SUPER_ADMIN,
    'Cannot assign SUPER_ADMIN role',
  ),
});

export type CreateOrganisationInput = z.infer<typeof createOrganisationSchema>;
export type UpdateOrganisationInput = z.infer<typeof updateOrganisationSchema>;
export type InviteUserInput = z.infer<typeof inviteUserSchema>;
export type UpdateUserRoleInput = z.infer<typeof updateUserRoleSchema>;
