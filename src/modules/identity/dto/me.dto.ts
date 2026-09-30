import { z } from 'zod';
import { MEMBERSHIP_ROLES, PLATFORM_ROLES } from '../../../common/auth/principal';
import { PERMISSIONS } from '../../../common/auth/decorators';
import { emailField, passwordField } from './auth.dto';

const isTimeZone = (tz: string): boolean => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

export const profile = z.object({
  id: z.uuid(),
  email: z.string(),
  emailVerified: z.boolean(),
  name: z.string(),
  jobTitle: z.string().nullable(),
  phone: z.string().nullable(),
  locale: z.string(),
  timezone: z.string(),
  theme: z.enum(['system', 'light', 'dark']),
  avatarFileId: z.uuid().nullable(),
  platformRole: z.enum(PLATFORM_ROLES).nullable(),
  mfaEnabled: z.boolean(),
  status: z.enum(['invited', 'active', 'disabled']),
  lastLoginAt: z.string().nullable(),
  termsVersion: z.string().nullable(),
  termsAcceptedAt: z.string().nullable(),
});

export const meResponse = z.object({
  user: profile,
  currentWorkspace: z
    .object({
      id: z.uuid(),
      name: z.string(),
      slug: z.string(),
      status: z.enum(['trial', 'active', 'suspended', 'closed']),
      role: z.enum([...MEMBERSHIP_ROLES, 'partner_admin']).nullable(),
      crossTenant: z.boolean(),
      scope: z.object({ companyIds: z.array(z.uuid()), projectIds: z.array(z.uuid()) }),
    })
    .nullable(),
  memberships: z.array(
    z.object({
      workspaceId: z.uuid(),
      workspaceName: z.string(),
      role: z.string(),
      via: z.enum(['membership', 'partner_grant']),
    }),
  ),
  permissions: z.array(z.enum(PERMISSIONS)),
  entitlements: z
    .object({ plan: z.string(), modules: z.array(z.string()), limits: z.record(z.string(), z.unknown()) })
    .nullable(),
  impersonatedBy: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  termsAcceptanceRequired: z.boolean(),
  currentTermsVersion: z.string(),
});

export const updateProfileBody = z
  .strictObject({
    name: z.string().trim().min(1).max(120),
    jobTitle: z.string().trim().max(120).nullable(),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9 ()-]{4,32}$/)
      .nullable(),
    locale: z.string().regex(/^[a-z]{2,3}(-[A-Z]{2})?$/),
    timezone: z.string().max(64).refine(isTimeZone, 'Unknown time zone'),
    theme: z.enum(['system', 'light', 'dark']),
    avatarFileId: z.uuid().nullable(),
  })
  .partial()
  .refine((b) => Object.keys(b).length > 0, 'Nothing to update');

export const changePasswordBody = z.strictObject({
  currentPassword: passwordField,
  newPassword: passwordField,
});
export const changeEmailBody = z.strictObject({ newEmail: emailField, password: passwordField });
export const acceptTermsBody = z.strictObject({ version: z.string().min(1).max(32) });
export const switchWorkspaceBody = z.strictObject({ workspaceId: z.uuid() });

export const session = z.object({
  id: z.uuid(),
  userAgent: z.string().nullable(),
  ip: z.string().nullable(),
  lastActiveAt: z.string(),
  expiresAt: z.string(),
  current: z.boolean(),
});
export const sessionList = z.object({ items: z.array(session) });
