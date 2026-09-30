import { Body, Controller, Delete, HttpCode, Post, Query, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { type z } from 'zod';
import { CurrentPrincipal } from '../../common/auth/current-principal';
import { AllowMfaEnrollment, Authenticated, Public } from '../../common/auth/decorators';
import { type AuthenticatedPrincipal } from '../../common/auth/principal';
import { ProblemError } from '../../common/errors/problem';
import { readCookie, ReqMeta, type RequestMeta } from '../../common/http/request-meta';
import {
  ApiZodBody,
  ApiZodOk,
  ApiZodQuery,
  ApiZodResponse,
  ZodValidationPipe,
} from '../../common/validation/zod';
import { AuthService, type LoginResult } from './auth.service';
import {
  acceptedResponse,
  emailOnlyBody,
  loginBody,
  loginResponse,
  logoutQuery,
  mfaConfirmBody,
  mfaConfirmResponse,
  mfaDisableBody,
  mfaSetupResponse,
  mfaVerifyBody,
  resetPasswordBody,
  sessionResponse,
  signupBody,
  tokenBody,
  verifyEmailResponse,
} from './dto/auth.dto';
import { MfaService } from './mfa.service';
import { type IssuedSession, REFRESH_COOKIE, SessionsService } from './sessions.service';
import { UsersRepository } from './users.repository';

const ACCEPTED = { status: 'accepted' as const };

/** M01 §8 `/auth/*`. Public routes are rate-limited inside the services. */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly mfa: MfaService,
    private readonly sessions: SessionsService,
    private readonly users: UsersRepository,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiZodBody(loginBody)
  @ApiZodOk(loginResponse, 'Session (refresh cookie set), or an MFA step')
  login(
    @Body(new ZodValidationPipe(loginBody)) body: z.infer<typeof loginBody>,
    @Res({ passthrough: true }) res: Response,
    @ReqMeta() meta: RequestMeta,
  ): Promise<LoginResult> {
    return this.auth.login(body, res, meta);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiZodOk(sessionResponse, 'Rotates the refresh cookie')
  refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @ReqMeta() meta: RequestMeta,
  ): Promise<IssuedSession> {
    return this.sessions.refresh(readCookie(req.headers.cookie, REFRESH_COOKIE), res, meta);
  }

  @Authenticated()
  @Post('logout')
  @HttpCode(204)
  @ApiBearerAuth()
  @ApiZodQuery(logoutQuery)
  @ApiNoContentResponse()
  async logout(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query(new ZodValidationPipe(logoutQuery)) query: z.infer<typeof logoutQuery>,
    @Res({ passthrough: true }) res: Response,
    @ReqMeta() meta: RequestMeta,
  ): Promise<void> {
    await this.auth.logout(principal, query.all, res, meta);
  }

  @Public()
  @Post('signup')
  @HttpCode(202)
  @ApiZodBody(signupBody)
  @ApiZodResponse(202, acceptedResponse, 'Always the same response; a verification email follows')
  async signup(
    @Body(new ZodValidationPipe(signupBody)) body: z.infer<typeof signupBody>,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.auth.signup(body, meta);
    return ACCEPTED;
  }

  @Public()
  @Post('verify-email')
  @HttpCode(200)
  @ApiZodBody(tokenBody)
  @ApiZodOk(verifyEmailResponse)
  async verifyEmail(
    @Body(new ZodValidationPipe(tokenBody)) body: z.infer<typeof tokenBody>,
    @ReqMeta() meta: RequestMeta,
  ) {
    const { purpose } = await this.auth.verifyEmail(body.token, meta);
    return { status: 'verified' as const, purpose };
  }

  @Public()
  @Post('verify-email/resend')
  @HttpCode(202)
  @ApiZodBody(emailOnlyBody)
  @ApiZodResponse(202, acceptedResponse)
  async resendVerification(
    @Body(new ZodValidationPipe(emailOnlyBody)) body: z.infer<typeof emailOnlyBody>,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.auth.resendVerification(body.email, meta);
    return ACCEPTED;
  }

  @Public()
  @Post('password/forgot')
  @HttpCode(202)
  @ApiZodBody(emailOnlyBody)
  @ApiZodResponse(202, acceptedResponse, 'Identical whether or not the email exists')
  async forgot(
    @Body(new ZodValidationPipe(emailOnlyBody)) body: z.infer<typeof emailOnlyBody>,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.auth.forgotPassword(body.email, meta);
    return ACCEPTED;
  }

  @Public()
  @Post('password/reset')
  @HttpCode(204)
  @ApiZodBody(resetPasswordBody)
  @ApiNoContentResponse({ description: 'Password set; all sessions revoked' })
  async reset(
    @Body(new ZodValidationPipe(resetPasswordBody)) body: z.infer<typeof resetPasswordBody>,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.auth.resetPassword(body, meta);
  }

  @Public()
  @Post('mfa/verify')
  @HttpCode(200)
  @ApiZodBody(mfaVerifyBody)
  @ApiZodOk(sessionResponse)
  verifyMfa(
    @Body(new ZodValidationPipe(mfaVerifyBody)) body: z.infer<typeof mfaVerifyBody>,
    @Res({ passthrough: true }) res: Response,
    @ReqMeta() meta: RequestMeta,
  ): Promise<IssuedSession> {
    return this.auth.verifyMfa(body, res, meta);
  }

  @Authenticated()
  @AllowMfaEnrollment()
  @Post('mfa/setup')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiZodOk(mfaSetupResponse)
  setupMfa(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    this.noImpersonation(principal);
    return this.mfa.setup(principal.userId);
  }

  @Authenticated()
  @AllowMfaEnrollment()
  @Post('mfa/confirm')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiZodBody(mfaConfirmBody)
  @ApiZodOk(mfaConfirmResponse, 'Recovery codes (shown once); a session when called with the enrolment token')
  async confirmMfa(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body(new ZodValidationPipe(mfaConfirmBody)) body: z.infer<typeof mfaConfirmBody>,
    @Res({ passthrough: true }) res: Response,
    @ReqMeta() meta: RequestMeta,
  ) {
    this.noImpersonation(principal);
    const { recoveryCodes } = await this.mfa.confirm(principal.userId, body.code, meta);
    if (!principal.mfaEnrollment) return { recoveryCodes, session: null };
    const user = await this.users.findById(principal.userId);
    if (!user) throw new ProblemError('unauthenticated', 'Authentication required');
    return {
      recoveryCodes,
      session: await this.auth.completeLogin(user, res, meta, principal.workspaceId, true),
    };
  }

  @Authenticated()
  @Delete('mfa')
  @HttpCode(204)
  @ApiBearerAuth()
  @ApiZodBody(mfaDisableBody)
  @ApiNoContentResponse()
  async disableMfa(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body(new ZodValidationPipe(mfaDisableBody)) body: z.infer<typeof mfaDisableBody>,
    @ReqMeta() meta: RequestMeta,
  ): Promise<void> {
    this.noImpersonation(principal);
    await this.mfa.disable(principal.userId, body, meta);
  }

  @Authenticated()
  @Post('impersonation/end')
  @HttpCode(204)
  @ApiBearerAuth()
  @ApiNoContentResponse()
  async endImpersonation(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @ReqMeta() meta: RequestMeta,
  ): Promise<void> {
    await this.auth.endImpersonation(principal, meta);
  }

  private noImpersonation(p: AuthenticatedPrincipal): void {
    if (p.impersonatorId) throw new ProblemError('forbidden', 'Not allowed while impersonating');
  }
}
