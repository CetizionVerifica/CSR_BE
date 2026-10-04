import { Injectable } from '@nestjs/common';
import { type Permission } from '../../common/auth/decorators';
import {
  type AuthenticatedPrincipal,
  MODULES,
  type ModuleName,
  type PlatformRoleName,
  type WorkspaceRole,
} from '../../common/auth/principal';
import { type User } from '../../generated/prisma/client';
import { AccessRepository } from './access.repository';
import { resolvePermissions } from './engine/permissions';

export interface WorkspaceAccess {
  workspaceId: string;
  role: WorkspaceRole | null;
  scope: { companyIds: string[]; projectIds: string[] };
  /** Platform owner/support without membership or grant. */
  crossTenant: boolean;
}

/** Platform roles that may open any workspace (audited): owner (full), support (read-only). */
const CROSS_TENANT_ROLES: PlatformRoleName[] = ['platform_owner', 'platform_support'];

const EMPTY_SCOPE = { companyIds: [], projectIds: [] };

/** Decides whether a user may act in a workspace, and with which role (M01 §2, §7.1). */
@Injectable()
export class WorkspaceAccessService {
  constructor(private readonly access: AccessRepository) {}

  async resolve(
    user: Pick<User, 'id' | 'platformRole'>,
    workspaceId: string,
    now = new Date(),
  ): Promise<WorkspaceAccess | null> {
    const membership = await this.access.findActiveMembership(user.id, workspaceId, now);
    if (membership) {
      return {
        workspaceId,
        role: membership.role,
        scope: { companyIds: membership.companyIds, projectIds: membership.projectIds },
        crossTenant: false,
      };
    }
    if (await this.access.hasPartnerAccess(user.id, workspaceId, now)) {
      return { workspaceId, role: 'partner_admin', scope: EMPTY_SCOPE, crossTenant: false };
    }
    if (user.platformRole && CROSS_TENANT_ROLES.includes(user.platformRole)) {
      const ws = await this.access.getWorkspace(workspaceId);
      if (ws) return { workspaceId, role: null, scope: EMPTY_SCOPE, crossTenant: true };
    }
    return null;
  }

  /**
   * Login/refresh default (M01 §7.1): requested → last session's → oldest membership/grant.
   * Cross-tenant workspaces are only kept when explicitly allowed (the session's own workspace on
   * refresh, which was chosen through the audited switch).
   */
  async defaultWorkspace(
    user: Pick<User, 'id' | 'platformRole'>,
    candidates: Array<string | null | undefined>,
    now = new Date(),
    allowCrossTenant = false,
  ): Promise<WorkspaceAccess | null> {
    for (const id of candidates) {
      if (!id) continue;
      const access = await this.resolve(user, id, now);
      if (access && (allowCrossTenant || !access.crossTenant)) return access;
    }
    const { memberships, grants } = await this.access.accessibleWorkspaces(user.id, now);
    const first = memberships[0]?.workspaceId ?? grants[0]?.clientWorkspaceId;
    return first ? this.resolve(user, first, now) : null;
  }

  async modules(workspaceId: string | null): Promise<Set<ModuleName>> {
    if (!workspaceId) return new Set();
    const ent = await this.access.entitlements(workspaceId);
    return new Set(
      (ent?.modules ?? []).filter((m): m is ModuleName => (MODULES as readonly string[]).includes(m)),
    );
  }

  async principalFor(
    user: Pick<User, 'id' | 'platformRole'>,
    access: WorkspaceAccess | null,
    token: { sessionId: string | null; impersonatorId: string | null; tokenId: string | null },
  ): Promise<AuthenticatedPrincipal> {
    const workspace = access ? await this.access.getWorkspace(access.workspaceId) : null;
    const permissions: Set<Permission> = resolvePermissions({
      platformRole: user.platformRole,
      workspaceRole: access?.role ?? null,
    });
    return {
      userId: user.id,
      sessionId: token.sessionId,
      workspaceId: access?.workspaceId ?? null,
      workspaceStatus: workspace?.status ?? null,
      platformRole: user.platformRole,
      role: access?.role ?? null,
      permissions,
      modules: await this.modules(access?.workspaceId ?? null),
      scope: access?.scope ?? EMPTY_SCOPE,
      impersonatorId: token.impersonatorId,
      crossTenant: access?.crossTenant ?? false,
      tokenId: token.tokenId,
    };
  }
}
