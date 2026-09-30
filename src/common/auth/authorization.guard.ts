import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ProblemError } from '../errors/problem';
import { PERMISSION_KEY, type Permission, PUBLIC_KEY } from './decorators';

/** Set on the request by the authentication middleware (M01). */
export interface AuthenticatedPrincipal {
  userId: string;
  workspaceId: string | null;
  permissions: ReadonlySet<Permission>;
}

export type RequestWithPrincipal = { principal?: AuthenticatedPrincipal };

/**
 * Deny by default. A route must be @Public() or carry @Can(permission); a route with neither
 * is a programming error and fails closed (and the route-decoration test fails the build).
 */
@Injectable()
export class AuthorizationGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) return true;

    const permission = this.reflector.getAllAndOverride<Permission | undefined>(PERMISSION_KEY, targets);
    if (!permission) {
      throw new ProblemError('forbidden', 'Route is not authorised', 'Missing @Can() or @Public() decorator');
    }

    const principal = context.switchToHttp().getRequest<RequestWithPrincipal>().principal;
    if (!principal) throw new ProblemError('unauthenticated', 'Authentication required');
    if (principal.permissions.has('platform:*') || principal.permissions.has(permission)) return true;
    throw new ProblemError('forbidden', 'Not allowed', `Requires permission ${permission}`);
  }
}
