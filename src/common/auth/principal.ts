import { type Permission } from './decorators';

/** Workspace roles stored on memberships (M01 §6). */
export const MEMBERSHIP_ROLES = [
  'workspace_owner',
  'workspace_admin',
  'contributor',
  'viewer',
  'auditor',
] as const;
export type MembershipRoleName = (typeof MEMBERSHIP_ROLES)[number];

/** Effective role in a workspace: a membership role, or partner_admin via a partner grant. */
export type WorkspaceRole = MembershipRoleName | 'partner_admin';

export const PLATFORM_ROLES = ['platform_owner', 'platform_assessor', 'platform_support'] as const;
export type PlatformRoleName = (typeof PLATFORM_ROLES)[number];

export const WORKSPACE_STATUSES = ['trial', 'active', 'suspended', 'closed'] as const;
export type WorkspaceStatusName = (typeof WORKSPACE_STATUSES)[number];

/** Entitlement modules (M02 §2, M01 §2). */
export const MODULES = [
  'gap',
  'materiality',
  'actions',
  'surveys',
  'supply_chain',
  'ranking',
  'frameworks',
  'ai',
  'carbon',
] as const;
export type ModuleName = (typeof MODULES)[number];

/** Set on the request by the AuthenticationGuard (M01). */
export interface AuthenticatedPrincipal {
  userId: string;
  /** Session id = refresh-token family; null for impersonation tokens. */
  sessionId: string | null;
  workspaceId: string | null;
  /** Status of the current workspace; suspended/closed workspaces are read-only (M02 US-02-5). */
  workspaceStatus: WorkspaceStatusName | null;
  platformRole: PlatformRoleName | null;
  role: WorkspaceRole | null;
  /** Permissions granted by role(s), before the entitlement check. */
  permissions: ReadonlySet<Permission>;
  /** Modules the current workspace has bought; empty without a workspace. */
  modules: ReadonlySet<ModuleName>;
  /** Optional contributor scope; empty arrays mean the whole workspace. */
  scope: { companyIds: string[]; projectIds: string[] };
  impersonatorId: string | null;
  /** Platform owner/support acting in a workspace without membership (audited per request). */
  crossTenant: boolean;
  /** Token id (impersonation tokens can be revoked by id). */
  tokenId: string | null;
  /** Only set for the MFA-enrolment token of platform users. */
  mfaEnrollment?: boolean;
}

export type RequestWithPrincipal = { principal?: AuthenticatedPrincipal };
