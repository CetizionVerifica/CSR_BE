import { type Permission } from '../../../common/auth/decorators';
import { type ModuleName, type PlatformRoleName, type WorkspaceRole } from '../../../common/auth/principal';

/**
 * Role → permission matrix, M01 §2. Pure data + functions, no I/O.
 * Permissions not granted to any role here (kpi:manage, report:publish, ai:*) are reserved for
 * modules whose specs define them; until then only platform:* passes.
 */
const OWNER: Permission[] = [
  'workspace:manage',
  'billing:manage',
  'org:manage-users',
  'company:create',
  'company:update',
  'project:create',
  'project:configure',
  'project:read',
  'gap:answer',
  'evidence:upload',
  'gap:submit-for-review',
  'materiality:rate',
  'stakeholder:manage',
  'survey:send',
  'kpi:enter',
  'supplier:manage',
  'supplier:rank',
  'report:export',
  'audit:read',
  'partner:manage',
];

const without = (list: Permission[], ...drop: Permission[]) => list.filter((p) => !drop.includes(p));

export const WORKSPACE_ROLE_PERMISSIONS: Record<WorkspaceRole, readonly Permission[]> = {
  workspace_owner: OWNER,
  workspace_admin: without(OWNER, 'workspace:manage', 'billing:manage'),
  contributor: ['project:read', 'gap:answer', 'evidence:upload', 'kpi:enter', 'report:export'],
  viewer: ['project:read', 'report:export'],
  auditor: ['project:read', 'report:export', 'audit:read'],
  partner_admin: without(OWNER, 'workspace:manage', 'billing:manage', 'audit:read', 'partner:manage'),
};

export const PLATFORM_ROLE_PERMISSIONS: Record<PlatformRoleName, readonly Permission[]> = {
  platform_owner: ['platform:*'],
  platform_assessor: ['project:read', 'gap:review', 'report:export'],
  platform_support: ['project:read', 'report:export', 'audit:read'],
};

/** Permission → entitlement module (M01 §2). Unlisted permissions need no module. */
export const PERMISSION_MODULE: Partial<Record<Permission, ModuleName>> = {
  'gap:answer': 'gap',
  'gap:submit-for-review': 'gap',
  'gap:review': 'gap',
  'evidence:upload': 'gap',
  'materiality:rate': 'materiality',
  'stakeholder:manage': 'materiality',
  'survey:send': 'surveys',
  'kpi:enter': 'actions',
  'kpi:manage': 'actions',
  'supplier:manage': 'supply_chain',
  'supplier:rank': 'ranking',
  'ai:use': 'ai',
  'ai:configure': 'ai',
};

/** Union of the permissions of the platform role and the workspace role. */
export function resolvePermissions(input: {
  platformRole: PlatformRoleName | null;
  workspaceRole: WorkspaceRole | null;
}): Set<Permission> {
  const out = new Set<Permission>();
  if (input.platformRole) PLATFORM_ROLE_PERMISSIONS[input.platformRole].forEach((p) => out.add(p));
  if (input.workspaceRole) WORKSPACE_ROLE_PERMISSIONS[input.workspaceRole].forEach((p) => out.add(p));
  return out;
}

export type PermissionDecision =
  | { allowed: true }
  | { allowed: false; reason: 'forbidden' }
  | { allowed: false; reason: 'entitlement_required'; module: ModuleName };

/**
 * Check order (M02 §7): role permission → module entitled. platform:* passes everything.
 * The entitlement check applies only inside a workspace; workspace-less platform permissions
 * (assessor reviews) are narrowed by their own modules (M05).
 */
export function decidePermission(
  permission: Permission,
  granted: ReadonlySet<Permission>,
  modules: ReadonlySet<ModuleName>,
  inWorkspace: boolean,
): PermissionDecision {
  if (granted.has('platform:*')) return { allowed: true };
  if (!granted.has(permission)) return { allowed: false, reason: 'forbidden' };
  const module = PERMISSION_MODULE[permission];
  if (module && inWorkspace && !modules.has(module)) {
    return { allowed: false, reason: 'entitlement_required', module };
  }
  return { allowed: true };
}

/** Permissions the FE may rely on: granted by role and entitled (`GET /me`). */
export function effectivePermissions(
  granted: ReadonlySet<Permission>,
  modules: ReadonlySet<ModuleName>,
  inWorkspace: boolean,
): Permission[] {
  return [...granted].filter((p) => decidePermission(p, granted, modules, inWorkspace).allowed).sort();
}

/** Role ceiling (M01 §7). partner_admin ranks as workspace_admin; the read-only roles share a rank. */
const RANK: Record<WorkspaceRole, number> = {
  workspace_owner: 3,
  workspace_admin: 2,
  partner_admin: 2,
  contributor: 1,
  viewer: 1,
  auditor: 1,
};

/** Actor = 'platform_owner' for platform owners acting in any workspace. */
export type RoleActor = WorkspaceRole | 'platform_owner';

const rankOf = (actor: RoleActor): number => (actor === 'platform_owner' ? 99 : RANK[actor]);

/** Only owners/admins (and partner admins / platform owners) grant roles, and only ≤ their own. */
export function canGrantRole(actor: RoleActor | null, role: WorkspaceRole): boolean {
  if (!actor || role === 'partner_admin') return false;
  if (rankOf(actor) < RANK.workspace_admin) return false;
  return RANK[role] <= rankOf(actor);
}

/** An actor may change or remove a member whose current role does not outrank them. */
export function canManageMember(actor: RoleActor | null, targetRole: WorkspaceRole): boolean {
  if (!actor || rankOf(actor) < RANK.workspace_admin) return false;
  return RANK[targetRole] <= rankOf(actor);
}
