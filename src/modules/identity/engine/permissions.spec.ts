import { type Permission } from '../../../common/auth/decorators';
import { type ModuleName, type WorkspaceRole } from '../../../common/auth/principal';
import {
  canGrantRole,
  canManageMember,
  decidePermission,
  effectivePermissions,
  type RoleActor,
  resolvePermissions,
} from './permissions';

const ALL_MODULES = new Set<ModuleName>([
  'gap',
  'materiality',
  'actions',
  'surveys',
  'supply_chain',
  'ranking',
  'frameworks',
  'ai',
  'carbon',
]);

describe('M01 §2 permission matrix', () => {
  // [permission, owner, admin, contributor, viewer, auditor, partner_admin, assessor, platform_owner]
  const matrix: Array<[Permission, ...boolean[]]> = [
    ['workspace:manage', true, false, false, false, false, false, false, true],
    ['billing:manage', true, false, false, false, false, false, false, true],
    ['org:manage-users', true, true, false, false, false, true, false, true],
    ['company:create', true, true, false, false, false, true, false, true],
    ['company:update', true, true, false, false, false, true, false, true],
    ['project:create', true, true, false, false, false, true, false, true],
    ['project:configure', true, true, false, false, false, true, false, true],
    ['project:read', true, true, true, true, true, true, true, true],
    ['gap:answer', true, true, true, false, false, true, false, true],
    ['evidence:upload', true, true, true, false, false, true, false, true],
    ['gap:submit-for-review', true, true, false, false, false, true, false, true],
    ['gap:review', false, false, false, false, false, false, true, true],
    ['materiality:rate', true, true, false, false, false, true, false, true],
    ['stakeholder:manage', true, true, false, false, false, true, false, true],
    ['survey:send', true, true, false, false, false, true, false, true],
    ['kpi:enter', true, true, true, false, false, true, false, true],
    ['supplier:manage', true, true, false, false, false, true, false, true],
    ['supplier:rank', true, true, false, false, false, true, false, true],
    ['report:export', true, true, true, true, true, true, true, true],
    ['audit:read', true, true, false, false, true, false, false, true],
    ['platform:*', false, false, false, false, false, false, false, true],
  ];
  const columns: Array<{
    workspaceRole: WorkspaceRole | null;
    platformRole: 'platform_owner' | 'platform_assessor' | null;
  }> = [
    { workspaceRole: 'workspace_owner', platformRole: null },
    { workspaceRole: 'workspace_admin', platformRole: null },
    { workspaceRole: 'contributor', platformRole: null },
    { workspaceRole: 'viewer', platformRole: null },
    { workspaceRole: 'auditor', platformRole: null },
    { workspaceRole: 'partner_admin', platformRole: null },
    { workspaceRole: null, platformRole: 'platform_assessor' },
    { workspaceRole: null, platformRole: 'platform_owner' },
  ];

  it.each(matrix)('%s', (permission, ...expected) => {
    columns.forEach((col, i) => {
      const granted = resolvePermissions(col);
      const allowed = decidePermission(permission, granted, ALL_MODULES, true).allowed;
      expect({ col, allowed }).toEqual({ col, allowed: expected[i] });
    });
  });

  it('platform_support is read-only with audit access', () => {
    expect([...resolvePermissions({ platformRole: 'platform_support', workspaceRole: null })].sort()).toEqual(
      ['audit:read', 'project:read', 'report:export'],
    );
  });

  it('unions platform and workspace roles', () => {
    const p = resolvePermissions({ platformRole: 'platform_assessor', workspaceRole: 'viewer' });
    expect(p.has('gap:review')).toBe(true);
    expect(p.has('project:read')).toBe(true);
    expect(p.has('gap:answer')).toBe(false);
  });

  it('no roles → no permissions', () => {
    expect(resolvePermissions({ platformRole: null, workspaceRole: null }).size).toBe(0);
  });
});

describe('entitlements (role AND module)', () => {
  const admin = resolvePermissions({ platformRole: null, workspaceRole: 'workspace_admin' });

  it.each<[Permission, ModuleName | null]>([
    ['gap:answer', 'gap'],
    ['evidence:upload', 'gap'],
    ['materiality:rate', 'materiality'],
    ['stakeholder:manage', 'materiality'],
    ['survey:send', 'surveys'],
    ['kpi:enter', 'actions'],
    ['supplier:manage', 'supply_chain'],
    ['supplier:rank', 'ranking'],
    ['project:read', null],
    ['org:manage-users', null],
  ])('%s requires %s', (permission, module) => {
    const none = decidePermission(permission, admin, new Set(), true);
    if (module) expect(none).toEqual({ allowed: false, reason: 'entitlement_required', module });
    else expect(none).toEqual({ allowed: true });
    expect(decidePermission(permission, admin, ALL_MODULES, true)).toEqual({ allowed: true });
  });

  it('role check comes before the module check', () => {
    const viewer = resolvePermissions({ platformRole: null, workspaceRole: 'viewer' });
    expect(decidePermission('gap:answer', viewer, new Set(), true)).toEqual({
      allowed: false,
      reason: 'forbidden',
    });
  });

  it('platform_owner bypasses entitlements', () => {
    const owner = resolvePermissions({ platformRole: 'platform_owner', workspaceRole: null });
    expect(decidePermission('gap:answer', owner, new Set(), true)).toEqual({ allowed: true });
  });

  it('outside a workspace platform permissions skip the module check', () => {
    const assessor = resolvePermissions({ platformRole: 'platform_assessor', workspaceRole: null });
    expect(decidePermission('gap:review', assessor, new Set(), false)).toEqual({ allowed: true });
  });

  it('effective permissions drop non-entitled ones and are sorted', () => {
    const contributor = resolvePermissions({ platformRole: null, workspaceRole: 'contributor' });
    expect(effectivePermissions(contributor, new Set(['gap']), true)).toEqual([
      'evidence:upload',
      'gap:answer',
      'project:read',
      'report:export',
    ]);
  });
});

describe('role ceiling (M01 §7)', () => {
  it.each<[RoleActor | null, WorkspaceRole, boolean]>([
    ['workspace_owner', 'workspace_owner', true],
    ['workspace_owner', 'workspace_admin', true],
    ['workspace_admin', 'workspace_owner', false],
    ['workspace_admin', 'workspace_admin', true],
    ['workspace_admin', 'contributor', true],
    ['workspace_admin', 'auditor', true],
    ['partner_admin', 'workspace_owner', false],
    ['partner_admin', 'workspace_admin', true],
    ['contributor', 'viewer', false],
    ['viewer', 'viewer', false],
    ['auditor', 'viewer', false],
    [null, 'viewer', false],
    ['platform_owner', 'workspace_owner', true],
    ['workspace_owner', 'partner_admin', false],
  ])('%s grants %s → %s', (actor, role, expected) => {
    expect(canGrantRole(actor, role)).toBe(expected);
  });

  it.each<[RoleActor | null, WorkspaceRole, boolean]>([
    ['workspace_admin', 'workspace_owner', false],
    ['workspace_admin', 'workspace_admin', true],
    ['workspace_owner', 'workspace_owner', true],
    ['contributor', 'viewer', false],
    ['platform_owner', 'workspace_owner', true],
  ])('%s manages a %s → %s', (actor, target, expected) => {
    expect(canManageMember(actor, target)).toBe(expected);
  });
});
