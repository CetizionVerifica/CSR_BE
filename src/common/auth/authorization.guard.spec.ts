import { type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ProblemError } from '../errors/problem';
import { type AuthenticatedPrincipal, AuthorizationGuard } from './authorization.guard';
import { Can, type Permission, Public } from './decorators';

class Controller {
  @Public() open() {}
  @Can('project:read') read() {}
  undecorated() {}
}

function ctx(handler: keyof Controller, principal?: AuthenticatedPrincipal): ExecutionContext {
  const proto = Controller.prototype as unknown as Record<string, () => void>;
  return {
    getHandler: () => proto[handler],
    getClass: () => Controller,
    switchToHttp: () => ({ getRequest: () => ({ principal }) }),
  } as unknown as ExecutionContext;
}

const principal = (...permissions: Permission[]): AuthenticatedPrincipal => ({
  userId: 'u1',
  workspaceId: 'w1',
  permissions: new Set(permissions),
});

describe('AuthorizationGuard', () => {
  const guard = new AuthorizationGuard(new Reflector());

  const expectProblem = (fn: () => unknown, type: string) => {
    try {
      fn();
      throw new Error('expected ProblemError');
    } catch (e) {
      expect(e).toBeInstanceOf(ProblemError);
      expect((e as ProblemError).type).toBe(type);
    }
  };

  it('allows @Public routes without a principal', () => {
    expect(guard.canActivate(ctx('open'))).toBe(true);
  });

  it('fails closed on routes without a decorator', () => {
    expectProblem(() => guard.canActivate(ctx('undecorated', principal('platform:*'))), 'forbidden');
  });

  it('requires authentication on @Can routes', () => {
    expectProblem(() => guard.canActivate(ctx('read')), 'unauthenticated');
  });

  it('rejects a principal without the permission', () => {
    expectProblem(() => guard.canActivate(ctx('read', principal('gap:answer'))), 'forbidden');
  });

  it('accepts the permission or platform:*', () => {
    expect(guard.canActivate(ctx('read', principal('project:read')))).toBe(true);
    expect(guard.canActivate(ctx('read', principal('platform:*')))).toBe(true);
  });
});
