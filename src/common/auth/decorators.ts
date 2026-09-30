import { SetMetadata } from '@nestjs/common';

export const PUBLIC_KEY = 'auth:public';
export const PERMISSION_KEY = 'auth:permission';
export const AUTHENTICATED_KEY = 'auth:authenticated';
export const MFA_ENROLLMENT_KEY = 'auth:mfa-enrollment';

/**
 * Permission strings are `<resource>:<action>` (docs/revamp/modules/M01-identity-access.md §2).
 * The list grows as modules land; keep it in sync with the M01 matrix.
 */
export const PERMISSIONS = [
  'workspace:manage',
  'billing:manage',
  'org:manage-users',
  'company:create',
  'company:update',
  'project:create',
  'project:configure',
  'project:read',
  'gap:answer',
  'gap:submit-for-review',
  'gap:review',
  'evidence:upload',
  'materiality:rate',
  'stakeholder:manage',
  'survey:send',
  'kpi:enter',
  'kpi:manage',
  'supplier:manage',
  'supplier:rank',
  'report:export',
  'report:publish',
  'audit:read',
  'ai:use',
  'ai:configure',
  'platform:*',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Route is reachable without authentication (health, auth, public survey links). */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/** Route requires the given permission in the caller's current workspace (role + entitlement). */
export const Can = (permission: Permission) => SetMetadata(PERMISSION_KEY, permission);

/**
 * Route requires a signed-in user but no permission: the caller's own resources (`/me`, logout,
 * MFA management). M01 §7.1.
 */
export const Authenticated = () => SetMetadata(AUTHENTICATED_KEY, true);

/** Also accepts the MFA-enrolment token issued to platform users without MFA (M01 §7.1). */
export const AllowMfaEnrollment = () => SetMetadata(MFA_ENROLLMENT_KEY, true);
