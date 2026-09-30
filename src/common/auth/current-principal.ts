import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { ProblemError } from '../errors/problem';
import { type AuthenticatedPrincipal, type RequestWithPrincipal } from './principal';

/** The authenticated caller (set by AuthenticationGuard). Only for @Can/@Authenticated routes. */
export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedPrincipal => {
    const principal = ctx.switchToHttp().getRequest<RequestWithPrincipal>().principal;
    if (!principal) throw new ProblemError('unauthenticated', 'Authentication required');
    return principal;
  },
);
