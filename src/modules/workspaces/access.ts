import { type Permission } from '../../common/auth/decorators';
import { type AuthenticatedPrincipal } from '../../common/auth/principal';
import { ProblemError } from '../../common/errors/problem';
import { decidePermission } from '../identity';

export const notFound = () => new ProblemError('not_found', 'Not found');

export const actorOf = (p: AuthenticatedPrincipal) => ({
  type: 'user' as const,
  id: p.userId,
  impersonatorId: p.impersonatorId,
});

/** The current workspace (routes under /companies, /workspaces/current act on it); 404 without one. */
export function currentWorkspace(p: AuthenticatedPrincipal): string {
  if (!p.workspaceId) throw notFound();
  return p.workspaceId;
}

/** Same decision as the guard, for checks inside a route (e.g. listing deleted companies). */
export function holds(p: AuthenticatedPrincipal, permission: Permission): boolean {
  return decidePermission(permission, p.permissions, p.modules, !!p.workspaceId).allowed;
}

export function invalid(path: string, message: string): ProblemError {
  return new ProblemError('validation_failed', 'Invalid input', message, { errors: [{ path, message }] });
}

export function limitExceeded(limit: string, max: number, title: string): ProblemError {
  return new ProblemError('limit_exceeded', title, `The plan allows ${max}`, { limit, max });
}
