import { type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ProblemError } from '../errors/problem';
import { AuthorizationGuard } from './authorization.guard';
import { AllowMfaEnrollment, Authenticated, Can, type Permission, Public } from './decorators';
import { type AuthenticatedPrincipal, type ModuleName } from './principal';

class Controller {
  @Public() open() {}
  @Can('project:read') read() {}
  @Can('gap:answer') answer() {}
  @Authenticated() me() {}
  @Authenticated() @AllowMfaEnrollment() enrol() {}
  undecorated() {}
}

function ctx(
  handler: keyof Controller,
  principal?: AuthenticatedPrincipal,
  params: Record<string, string> = {},
  method = 'GET',
): ExecutionContext {
  const proto = Controller.prototype as unknown as Record<string, () => void>;
  return {
    getHandler: () => proto[handler],
    getClass: () => Controller,
    switchToHttp: () => ({ getRequest: () => ({ principal, params, method }) }),
  } as unknown as ExecutionContext;
}

const principal = (
  permissions: Permission[],
  opts: {
    modules?: ModuleName[];
    workspaceId?: string | null;
    mfaEnrollment?: boolean;
    workspaceStatus?: AuthenticatedPrincipal['workspaceStatus'];
    platformRole?: AuthenticatedPrincipal['platformRole'];
  } = {},
): AuthenticatedPrincipal => ({
  userId: 'u1',
  sessionId: 's1',
  workspaceId: opts.workspaceId === undefined ? 'w1' : opts.workspaceId,
  workspaceStatus: opts.workspaceStatus ?? 'active',
  platformRole: opts.platformRole ?? null,
  role: null,
  permissions: new Set(permissions),
  modules: new Set(opts.modules ?? []),
  scope: { companyIds: [], projectIds: [] },
  impersonatorId: null,
  crossTenant: false,
  tokenId: 't1',
  ...(opts.mfaEnrollment ? { mfaEnrollment: true } : {}),
});

describe('AuthorizationGuard', () => {
  const guard = new AuthorizationGuard(new Reflector());

  const expectProblem = (fn: () => unknown, type: string, extra?: Record<string, unknown>) => {
    try {
      fn();
      throw new Error('expected ProblemError');
    } catch (e) {
      expect(e).toBeInstanceOf(ProblemError);
      expect((e as ProblemError).type).toBe(type);
      if (extra) expect((e as ProblemError).extensions).toMatchObject(extra);
    }
  };

  it('allows @Public routes without a principal', () => {
    expect(guard.canActivate(ctx('open'))).toBe(true);
  });

  it('fails closed on routes without a decorator', () => {
    expectProblem(() => guard.canActivate(ctx('undecorated', principal(['platform:*']))), 'forbidden');
  });

  it('requires authentication on @Can and @Authenticated routes', () => {
    expectProblem(() => guard.canActivate(ctx('read')), 'unauthenticated');
    expectProblem(() => guard.canActivate(ctx('me')), 'unauthenticated');
  });

  it('@Authenticated needs no permission', () => {
    expect(guard.canActivate(ctx('me', principal([])))).toBe(true);
  });

  it('rejects a principal without the permission', () => {
    expectProblem(() => guard.canActivate(ctx('read', principal(['gap:answer']))), 'forbidden');
  });

  it('accepts the permission or platform:*', () => {
    expect(guard.canActivate(ctx('read', principal(['project:read'])))).toBe(true);
    expect(guard.canActivate(ctx('read', principal(['platform:*'])))).toBe(true);
  });

  it('US-02-3: checks the entitlement after the role (403 entitlement_required with the module)', () => {
    expectProblem(() => guard.canActivate(ctx('answer', principal(['gap:answer']))), 'entitlement_required', {
      module: 'gap',
    });
    expect(guard.canActivate(ctx('answer', principal(['gap:answer'], { modules: ['gap'] })))).toBe(true);
  });

  it('returns 404 when :wid is not the current workspace (before the permission check)', () => {
    expectProblem(
      () => guard.canActivate(ctx('read', principal(['project:read']), { wid: 'w2' })),
      'not_found',
    );
    expectProblem(() => guard.canActivate(ctx('read', principal([]), { wid: 'w2' })), 'not_found');
    expect(guard.canActivate(ctx('read', principal(['project:read']), { wid: 'w1' }))).toBe(true);
  });

  it('accepts the MFA-enrolment principal only where allowed', () => {
    const enrol = principal([], { mfaEnrollment: true });
    expect(guard.canActivate(ctx('enrol', enrol))).toBe(true);
    expectProblem(() => guard.canActivate(ctx('me', enrol)), 'unauthenticated');
  });

  it('makes suspended and closed workspaces read-only, except for platform owners (US-02-5)', () => {
    const suspended = principal(['project:read'], { workspaceStatus: 'suspended' });
    expect(guard.canActivate(ctx('read', suspended))).toBe(true);
    expectProblem(() => guard.canActivate(ctx('read', suspended, {}, 'POST')), 'workspace_suspended');
    const closed = principal(['project:read'], { workspaceStatus: 'closed' });
    expectProblem(() => guard.canActivate(ctx('read', closed, {}, 'PATCH')), 'workspace_suspended');
    const owner = principal(['platform:*'], { workspaceStatus: 'suspended', platformRole: 'platform_owner' });
    expect(guard.canActivate(ctx('read', owner, {}, 'POST'))).toBe(true);
    expect(guard.canActivate(ctx('me', principal([], { workspaceStatus: 'suspended' }), {}, 'POST'))).toBe(
      true,
    );
  });
});
