import { z } from 'zod';

/**
 * Entitlement limits (M02 §4.1, §6) and soft-delete rules (§4.1, §7). Pure functions, no I/O.
 * A missing or null limit means "unlimited".
 */
const limit = z.number().int().min(0).nullable().optional();

export const limitsSchema = z.strictObject({
  companies: limit,
  users: limit,
  projectsPerYear: limit,
  clientWorkspaces: limit,
  aiMonthlyUsd: limit,
});
export type Limits = z.infer<typeof limitsSchema>;
export type LimitName = keyof Limits;

/** Reads the stored limits JSON, ignoring unknown keys and invalid values (never throws). */
export function parseLimits(json: unknown): Limits {
  if (!json || typeof json !== 'object') return {};
  const out: Limits = {};
  for (const key of Object.keys(limitsSchema.shape) as LimitName[]) {
    const value = (json as Record<string, unknown>)[key];
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) out[key] = value;
  }
  return out;
}

/** True when adding `adding` items keeps `used` within the limit. */
export function withinLimit(max: number | null | undefined, used: number, adding = 1): boolean {
  return max === null || max === undefined || used + adding <= max;
}

/** A workspace acts as a partner (legacy reseller) when its plan allows client workspaces. */
export function isPartnerWorkspace(limits: Limits): boolean {
  return (limits.clientWorkspaces ?? 0) > 0;
}

/** Soft-deleted companies can be restored for 30 days, then the cleanup job deletes them. */
export const RESTORE_WINDOW_DAYS = 30;
const DAY_MS = 24 * 3600_000;

export function restoreDeadline(deletedAt: Date): Date {
  return new Date(deletedAt.getTime() + RESTORE_WINDOW_DAYS * DAY_MS);
}

export function canRestore(deletedAt: Date | null, now: Date): boolean {
  return deletedAt !== null && now < restoreDeadline(deletedAt);
}

/** Purge threshold: rows deleted before this instant are past the restore window. */
export function purgeBefore(now: Date): Date {
  return new Date(now.getTime() - RESTORE_WINDOW_DAYS * DAY_MS);
}

/** Deleting a company requires typing its name (display or legal; case and spacing ignored). */
export function confirmsCompanyName(
  typed: string | undefined,
  company: { displayName: string; legalName: string },
): boolean {
  if (!typed) return false;
  const norm = (s: string) => s.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
  const t = norm(typed);
  return t.length > 0 && (t === norm(company.displayName) || t === norm(company.legalName));
}
