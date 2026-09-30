import { z } from 'zod';
import { MEMBERSHIP_ROLES } from '../../../common/auth/principal';
import { page, paginationQuery } from '../../../common/pagination';
import { emailField, passwordField } from './auth.dto';

const ids = z
  .array(z.uuid())
  .max(500)
  .transform((v) => [...new Set(v.map((s) => s.toLowerCase()))]);

export const member = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  name: z.string(),
  email: z.string(),
  role: z.enum(MEMBERSHIP_ROLES),
  companyIds: z.array(z.uuid()),
  projectIds: z.array(z.uuid()),
  status: z.enum(['active', 'deactivated', 'disabled']),
  lastLoginAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  createdAt: z.string(),
});
export const memberPage = page(member);

export const listMembersQuery = paginationQuery.extend({
  role: z.enum(MEMBERSHIP_ROLES).optional(),
  status: z.enum(['active', 'deactivated']).optional(),
});

export const updateMemberBody = z
  .strictObject({
    role: z.enum(MEMBERSHIP_ROLES),
    companyIds: ids,
    projectIds: ids,
    expiresAt: z.iso.datetime({ offset: true }).nullable(),
    active: z.boolean(),
  })
  .partial()
  .refine((b) => Object.keys(b).length > 0, 'Nothing to update');

export const inviteItem = z.strictObject({
  email: emailField,
  role: z.enum(MEMBERSHIP_ROLES),
  companyIds: ids.default([]),
  projectIds: ids.default([]),
});

export const inviteBody = z.strictObject({
  invitations: z
    .array(inviteItem)
    .min(1)
    .max(200)
    .refine((list) => new Set(list.map((i) => i.email)).size === list.length, 'Duplicate email'),
});
export const inviteCsvBody = z.strictObject({ csv: z.string().min(1).max(200_000) });

export const inviteResult = z.object({
  results: z.array(
    z.object({
      email: z.string(),
      status: z.enum(['invited', 'already_member']),
      invitationId: z.uuid().nullable(),
    }),
  ),
});

export const invitation = z.object({
  id: z.uuid(),
  email: z.string(),
  role: z.enum(MEMBERSHIP_ROLES),
  companyIds: z.array(z.uuid()),
  projectIds: z.array(z.uuid()),
  expiresAt: z.string(),
  expired: z.boolean(),
  invitedBy: z.uuid(),
  createdAt: z.string(),
});
export const invitationPage = page(invitation);

export const acceptInvitationBody = z.strictObject({
  token: z.string().min(16).max(256),
  name: z.string().trim().min(1).max(120).optional(),
  password: passwordField.optional(),
});
export const acceptInvitationResponse = z.object({
  status: z.literal('accepted'),
  workspaceId: z.uuid(),
  newUser: z.boolean(),
});
