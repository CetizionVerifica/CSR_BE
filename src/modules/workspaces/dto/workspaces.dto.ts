import { z } from 'zod';
import { MODULES, WORKSPACE_STATUSES } from '../../../common/auth/principal';
import { page, paginationQuery } from '../../../common/pagination';
import { limitsSchema } from '../engine/limits';

const isTimeZone = (tz: string): boolean => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

export const DATA_REGIONS = ['eu', 'in', 'us'] as const;
export const CREATED_VIA = ['platform', 'partner', 'self_service'] as const;

export const brandingSchema = z.strictObject({
  accentColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .nullable()
    .optional()
    .describe('Accent colour for reports and emails (#RRGGBB)'),
  reportFooter: z.string().trim().max(500).nullable().optional(),
});

export const workspace = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  status: z.enum(WORKSPACE_STATUSES),
  country: z.string().nullable(),
  defaultLocale: z.string(),
  timezone: z.string(),
  dataRegion: z.enum(DATA_REGIONS),
  trialEndsAt: z.string().nullable(),
  createdVia: z.enum(CREATED_VIA),
  logoFileId: z.uuid().nullable(),
  branding: brandingSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const workspaceFields = {
  name: z.string().trim().min(1).max(120),
  country: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .nullable(),
  defaultLocale: z.string().regex(/^[a-z]{2,3}(-[A-Z]{2})?$/),
  timezone: z.string().max(64).refine(isTimeZone, 'Unknown time zone'),
};

export const updateWorkspaceBody = z
  .strictObject({ ...workspaceFields, branding: brandingSchema, logoFileId: z.uuid().nullable() })
  .partial()
  .refine((b) => Object.keys(b).length > 0, 'Nothing to update');
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceBody>;

export const usage = z.object({
  companies: z.number().int(),
  users: z.number().int().describe('Active members + pending invitations'),
  clientWorkspaces: z.number().int(),
});

export const entitlementsResponse = z.object({
  plan: z.string(),
  modules: z.array(z.enum(MODULES)),
  limits: limitsSchema,
  trialEndsAt: z.string().nullable(),
  usage,
});

export const partnerGrant = z.object({
  id: z.uuid(),
  partnerWorkspaceId: z.uuid(),
  partnerName: z.string(),
  createdAt: z.string(),
});
export const partnerGrantList = z.object({ items: z.array(partnerGrant) });

// ─── platform (M02 §8, platform_owner) ───
export const listPlatformWorkspacesQuery = paginationQuery.extend({
  q: z.string().trim().max(100).optional(),
  status: z.enum(WORKSPACE_STATUSES).optional(),
});

export const platformWorkspace = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  status: z.enum(WORKSPACE_STATUSES),
  createdVia: z.enum(CREATED_VIA),
  partnerWorkspaceId: z.uuid().nullable(),
  trialEndsAt: z.string().nullable(),
  createdAt: z.string(),
  plan: z.string().nullable(),
  modules: z.array(z.enum(MODULES)),
  limits: limitsSchema,
  companies: z.number().int(),
  members: z.number().int(),
});
export const platformWorkspacePage = page(platformWorkspace);

export const updatePlatformWorkspaceBody = z
  .strictObject({
    status: z.enum(WORKSPACE_STATUSES),
    trialEndsAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .partial()
  .refine((b) => Object.keys(b).length > 0, 'Nothing to update');

export const putEntitlementsBody = z.strictObject({
  plan: z.string().trim().min(1).max(64),
  modules: z
    .array(z.enum(MODULES))
    .max(MODULES.length)
    .transform((m) => [...new Set(m)]),
  limits: limitsSchema,
});
export type PutEntitlementsInput = z.infer<typeof putEntitlementsBody>;

export const platformEntitlements = z.object({
  plan: z.string(),
  modules: z.array(z.enum(MODULES)),
  limits: limitsSchema,
});
