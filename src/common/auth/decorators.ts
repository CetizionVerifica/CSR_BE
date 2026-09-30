import { SetMetadata } from '@nestjs/common';

export const PUBLIC_KEY = 'auth:public';
export const PERMISSION_KEY = 'auth:permission';

/**
 * Permission strings are `<resource>:<action>` (docs/revamp/modules/M01-identity-access.md §2).
 * The list grows as modules land; keep it in sync with the M01 matrix.
 */
export type Permission =
  | 'workspace:manage'
  | 'billing:manage'
  | 'org:manage-users'
  | 'company:create'
  | 'company:update'
  | 'project:create'
  | 'project:configure'
  | 'project:read'
  | 'gap:answer'
  | 'gap:submit-for-review'
  | 'gap:review'
  | 'evidence:upload'
  | 'materiality:rate'
  | 'stakeholder:manage'
  | 'survey:send'
  | 'kpi:enter'
  | 'kpi:manage'
  | 'supplier:manage'
  | 'supplier:rank'
  | 'report:export'
  | 'report:publish'
  | 'audit:read'
  | 'ai:use'
  | 'ai:configure'
  | 'platform:*';

/** Route is reachable without authentication (health, auth, public survey links). */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/** Route requires the given permission in the caller's current workspace. */
export const Can = (permission: Permission) => SetMetadata(PERMISSION_KEY, permission);
