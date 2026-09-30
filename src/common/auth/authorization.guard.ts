import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { decidePermission } from '../../modules/identity/engine/permissions';
import { ProblemError } from '../errors/problem';
import {
  AUTHENTICATED_KEY,
  MFA_ENROLLMENT_KEY,
  PERMISSION_KEY,
  type Permission,
  PUBLIC_KEY,
} from './decorators';
import { type RequestWithPrincipal } from './principal';

export type { AuthenticatedPrincipal, RequestWithPrincipal } from './principal';

/**
 * Deny by default. A route must be @Public(), @Authenticated() or carry @Can(permission); a route
 * with none is a programming error and fails closed (and the route-decoration test fails the build).
 * @Can checks the `:wid` tenancy, the role permission, then the workspace entitlement (M01 §2, M02 §7).
 */
@Injectable()
export class AuthorizationGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) return true;

    const permission = this.reflector.getAllAndOverride<Permission | undefined>(PERMISSION_KEY, targets);
    const authenticated = this.reflector.getAllAndOverride<boolean>(AUTHENTICATED_KEY, targets);
    if (!permission && !authenticated) {
      throw new ProblemError(
        'forbidden',
        'Route is not authorised',
        'Missing @Can(), @Authenticated() or @Public() decorator',
      );
    }

    const req = context
      .switchToHttp()
      .getRequest<RequestWithPrincipal & { params?: Record<string, unknown> }>();
    const principal = req.principal;
    if (!principal) throw new ProblemError('unauthenticated', 'Authentication required');
    if (principal.mfaEnrollment && !this.reflector.getAllAndOverride<boolean>(MFA_ENROLLMENT_KEY, targets)) {
      throw new ProblemError('unauthenticated', 'Complete two-factor setup first');
    }
    if (!permission) return true;

    // Route-level tenancy: a `:wid` path segment must be the caller's current workspace. Any other
    // id is indistinguishable from a missing one (404), before validation reveals anything.
    const wid = req.params?.wid;
    if (wid !== undefined && wid !== principal.workspaceId) throw new ProblemError('not_found', 'Not found');

    const decision = decidePermission(
      permission,
      principal.permissions,
      principal.modules,
      !!principal.workspaceId,
    );
    if (decision.allowed) return true;
    if (decision.reason === 'entitlement_required') {
      throw new ProblemError(
        'entitlement_required',
        'Module not included in your plan',
        `Requires module ${decision.module}`,
        {
          module: decision.module,
        },
      );
    }
    throw new ProblemError('forbidden', 'Not allowed', `Requires permission ${permission}`);
  }
}
