import { z } from 'zod';
import { page, paginationQuery } from '../../../common/pagination';

const SIZE_BANDS = ['micro', 'small', 'medium', 'large'] as const;

const CURRENCIES = new Set(Intl.supportedValuesOf('currency'));
const optionalText = (max: number) => z.string().trim().max(max).nullable();

export const addressSchema = z.strictObject({
  line1: z.string().trim().max(200).nullable().optional(),
  line2: z.string().trim().max(200).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  postalCode: z.string().trim().max(32).nullable().optional(),
  state: z.string().trim().max(120).nullable().optional(),
});

const countryCode = z
  .string()
  .regex(/^[A-Z]{2}$/, 'ISO 3166-1 alpha-2 code')
  .describe('ISO 3166-1 alpha-2 country code from GET /reference/countries');

const currencyCode = z
  .string()
  .regex(/^[A-Z]{3}$/)
  .refine((c) => CURRENCIES.has(c), 'Unknown currency')
  .describe('ISO 4217 currency code');

const companyFields = {
  legalName: z.string().trim().min(1).max(200),
  displayName: z.string().trim().min(1).max(120),
  registrationNo: optionalText(64),
  sectorCode: z.string().min(1).max(64).describe('Sector code from GET /reference/sectors'),
  sizeBand: z.enum(SIZE_BANDS),
  employeeCount: z.number().int().min(0).max(10_000_000).nullable(),
  country: countryCode,
  region: optionalText(120),
  website: z
    .url({ protocol: /^https?$/ })
    .max(300)
    .nullable(),
  description: optionalText(2000),
  address: addressSchema.nullable(),
  fiscalYearStartMonth: z.number().int().min(1).max(12),
  currency: currencyCode,
  parentCompanyId: z.uuid().nullable(),
  logoFileId: z.uuid().nullable().describe('A ready file with purpose logo (POST /files/uploads)'),
};

export const createCompanyBody = z.strictObject({
  ...companyFields,
  displayName: companyFields.displayName.optional(),
  registrationNo: companyFields.registrationNo.optional(),
  employeeCount: companyFields.employeeCount.optional(),
  region: companyFields.region.optional(),
  website: companyFields.website.optional(),
  description: companyFields.description.optional(),
  address: companyFields.address.optional(),
  fiscalYearStartMonth: companyFields.fiscalYearStartMonth.default(1),
  parentCompanyId: companyFields.parentCompanyId.optional(),
  logoFileId: companyFields.logoFileId.optional(),
});
export type CreateCompanyInput = z.infer<typeof createCompanyBody>;

export const updateCompanyBody = z
  .strictObject(companyFields)
  .partial()
  .refine((b) => Object.keys(b).length > 0, 'Nothing to update');
export type UpdateCompanyInput = z.infer<typeof updateCompanyBody>;

export const company = z.object({
  id: z.uuid(),
  legalName: z.string(),
  displayName: z.string(),
  registrationNo: z.string().nullable(),
  sectorCode: z.string().nullable(),
  sizeBand: z.enum(SIZE_BANDS).nullable(),
  employeeCount: z.number().int().nullable(),
  country: z.string().nullable(),
  region: z.string().nullable(),
  website: z.string().nullable(),
  description: z.string().nullable(),
  address: addressSchema.nullable(),
  logoFileId: z.uuid().nullable(),
  fiscalYearStartMonth: z.number().int(),
  currency: z.string(),
  parentCompanyId: z.uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
  restorableUntil: z
    .string()
    .nullable()
    .describe('Set on deleted companies: last moment a restore is possible'),
  lastActivityAt: z.string().nullable(),
});
export const companyPage = page(company);

export const listCompaniesQuery = paginationQuery.extend({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['active', 'deleted']).default('active'),
});

export const deleteCompanyQuery = z.object({
  confirmName: z.string().max(200).optional().describe('The company name, typed by the user'),
});

export const activityQuery = z.object({
  cursor: z
    .string()
    .regex(/^[0-9]{1,19}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const activityItem = z.object({
  id: z.string(),
  occurredAt: z.string(),
  action: z.string(),
  actor: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  fields: z.array(z.string()),
});
export const activityPage = page(activityItem);
