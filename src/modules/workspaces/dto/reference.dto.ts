import { z } from 'zod';

export const sector = z.object({
  code: z.string(),
  parentCode: z.string().nullable(),
  label: z.string().describe('English label; the FE translates by labelKey when it has a translation'),
  labelKey: z.string(),
  sortOrder: z.number().int(),
  isicCode: z.string().nullable(),
  naceCode: z.string().nullable(),
});
export const sectorList = z.object({ items: z.array(sector) });

export const country = z.object({
  code: z.string().describe('ISO 3166-1 alpha-2; the FE names it with Intl.DisplayNames'),
  region: z.string(),
  labelKey: z.string(),
});
export const countryList = z.object({ items: z.array(country) });
