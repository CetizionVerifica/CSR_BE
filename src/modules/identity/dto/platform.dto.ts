import { z } from 'zod';
import { PLATFORM_ROLES } from '../../../common/auth/principal';
import { page, paginationQuery } from '../../../common/pagination';
import { profile } from './me.dto';

export const listPlatformUsersQuery = paginationQuery.extend({
  q: z.string().trim().min(1).max(100).optional(),
  status: z.enum(['invited', 'active', 'disabled']).optional(),
  platformRole: z.enum(PLATFORM_ROLES).optional(),
});
export const platformUserPage = page(profile);

export const updatePlatformUserBody = z
  .strictObject({
    status: z.enum(['active', 'disabled']),
    platformRole: z.enum(PLATFORM_ROLES).nullable(),
  })
  .partial()
  .refine((b) => Object.keys(b).length > 0, 'Nothing to update');

export const impersonateBody = z.strictObject({
  workspaceId: z.uuid().optional(),
  reason: z.string().trim().min(5).max(500),
});
