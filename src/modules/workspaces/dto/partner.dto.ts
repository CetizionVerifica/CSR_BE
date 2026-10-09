import { z } from 'zod';
import { WORKSPACE_STATUSES } from '../../../common/auth/principal';
import { page, paginationQuery } from '../../../common/pagination';
import { emailField } from '../../identity';
import { createCompanyBody } from './companies.dto';
import { DATA_REGIONS, workspaceFields } from './workspaces.dto';

export const listClientsQuery = paginationQuery;

export const partnerClient = z.object({
  grantId: z.uuid(),
  workspaceId: z.uuid(),
  name: z.string(),
  status: z.enum(WORKSPACE_STATUSES),
  companies: z.number().int(),
  lastActivityAt: z.string().nullable(),
  createdAt: z.string(),
});
export const partnerClientPage = page(partnerClient).extend({
  usage: z.object({ clientWorkspaces: z.number().int(), limit: z.number().int().nullable() }),
});

export const createClientBody = z.strictObject({
  workspace: z.strictObject({
    name: workspaceFields.name,
    country: workspaceFields.country.unwrap(),
    defaultLocale: workspaceFields.defaultLocale.default('en'),
    timezone: workspaceFields.timezone.default('UTC'),
    dataRegion: z.enum(DATA_REGIONS).default('eu'),
  }),
  company: createCompanyBody,
  owner: z.strictObject({ email: emailField }),
});
export type CreateClientInput = z.infer<typeof createClientBody>;

export const createClientResponse = z.object({
  workspaceId: z.uuid(),
  companyId: z.uuid(),
  grantId: z.uuid(),
  invitationId: z.uuid(),
});
