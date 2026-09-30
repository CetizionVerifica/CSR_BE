import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentPrincipal } from '../../common/auth/current-principal';
import { Authenticated } from '../../common/auth/decorators';
import { type AuthenticatedPrincipal } from '../../common/auth/principal';
import { Idempotent } from '../../common/idempotency/idempotency.interceptor';
import { ReqMeta, type RequestMeta } from '../../common/http/request-meta';
import { ApiZodBody, ApiZodOk, ApiZodResponse, ZodValidationPipe } from '../../common/validation/zod';
import { acceptedResponse, sessionResponse } from './dto/auth.dto';
import {
  acceptTermsBody,
  changeEmailBody,
  changePasswordBody,
  meResponse,
  profile,
  sessionList,
  switchWorkspaceBody,
  updateProfileBody,
} from './dto/me.dto';
import { MeService } from './me.service';

/** M01 §8 `/me*`: the caller's own account. */
@ApiTags('me')
@ApiBearerAuth()
@Authenticated()
@Controller('me')
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  @ApiZodOk(meResponse)
  get(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.me.me(principal);
  }

  @Patch()
  @ApiZodBody(updateProfileBody)
  @ApiZodOk(profile)
  update(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body(new ZodValidationPipe(updateProfileBody)) body: z.infer<typeof updateProfileBody>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.me.updateProfile(principal, body, meta);
  }

  @Post('password')
  @HttpCode(204)
  @ApiZodBody(changePasswordBody)
  @ApiNoContentResponse({ description: 'Password changed; other sessions revoked' })
  async changePassword(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body(new ZodValidationPipe(changePasswordBody)) body: z.infer<typeof changePasswordBody>,
    @ReqMeta() meta: RequestMeta,
  ): Promise<void> {
    await this.me.changePassword(principal, body, meta);
  }

  @Post('email')
  @HttpCode(202)
  @Idempotent()
  @ApiZodBody(changeEmailBody)
  @ApiZodResponse(202, acceptedResponse, 'A verification link is sent to the new address')
  async changeEmail(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body(new ZodValidationPipe(changeEmailBody)) body: z.infer<typeof changeEmailBody>,
  ) {
    await this.me.changeEmail(principal, body);
    return { status: 'accepted' as const };
  }

  @Post('terms')
  @HttpCode(204)
  @ApiZodBody(acceptTermsBody)
  @ApiNoContentResponse()
  async acceptTerms(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body(new ZodValidationPipe(acceptTermsBody)) body: z.infer<typeof acceptTermsBody>,
    @ReqMeta() meta: RequestMeta,
  ): Promise<void> {
    await this.me.acceptTerms(principal, body.version, meta);
  }

  @Post('workspace')
  @HttpCode(200)
  @ApiZodBody(switchWorkspaceBody)
  @ApiZodOk(sessionResponse, 'New access token scoped to the workspace')
  switchWorkspace(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body(new ZodValidationPipe(switchWorkspaceBody)) body: z.infer<typeof switchWorkspaceBody>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.me.switchWorkspace(principal, body.workspaceId, meta);
  }

  @Get('sessions')
  @ApiZodOk(sessionList)
  async sessions(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return { items: await this.me.listSessions(principal) };
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  @ApiNoContentResponse()
  async revokeSession(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', new ZodValidationPipe(z.uuid())) id: string,
    @ReqMeta() meta: RequestMeta,
  ): Promise<void> {
    await this.me.revokeSession(principal, id, meta);
  }
}
