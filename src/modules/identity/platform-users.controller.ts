import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentPrincipal } from '../../common/auth/current-principal';
import { Can } from '../../common/auth/decorators';
import { type AuthenticatedPrincipal } from '../../common/auth/principal';
import { ReqMeta, type RequestMeta } from '../../common/http/request-meta';
import { ApiZodBody, ApiZodOk, ApiZodQuery, ZodValidationPipe } from '../../common/validation/zod';
import { sessionResponse } from './dto/auth.dto';
import { profile, sessionList } from './dto/me.dto';
import {
  impersonateBody,
  listPlatformUsersQuery,
  platformUserPage,
  updatePlatformUserBody,
} from './dto/platform.dto';
import { PlatformUsersService } from './platform-users.service';

const uuid = new ZodValidationPipe(z.uuid());

/** M01 §8 `/platform/users*` (platform owners only; every change audited). */
@ApiTags('platform')
@ApiBearerAuth()
@Can('platform:*')
@Controller('platform/users')
export class PlatformUsersController {
  constructor(private readonly platform: PlatformUsersService) {}

  @Get()
  @ApiZodQuery(listPlatformUsersQuery)
  @ApiZodOk(platformUserPage)
  list(@Query(new ZodValidationPipe(listPlatformUsersQuery)) q: z.infer<typeof listPlatformUsersQuery>) {
    return this.platform.list({ q: q.q, status: q.status, platformRole: q.platformRole }, q.cursor, q.limit);
  }

  @Patch(':id')
  @ApiZodBody(updatePlatformUserBody)
  @ApiZodOk(profile)
  update(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(updatePlatformUserBody)) body: z.infer<typeof updatePlatformUserBody>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.platform.update(p, id, body, meta);
  }

  @Get(':id/sessions')
  @ApiZodOk(sessionList)
  async sessions(@Param('id', uuid) id: string) {
    return { items: await this.platform.listSessions(id) };
  }

  @Delete(':id/sessions/:sid')
  @HttpCode(204)
  @ApiNoContentResponse()
  async revokeSession(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('id', uuid) id: string,
    @Param('sid', uuid) sid: string,
    @ReqMeta() meta: RequestMeta,
  ): Promise<void> {
    await this.platform.revokeSession(p, id, sid, meta);
  }

  @Post(':id/impersonate')
  @HttpCode(200)
  @ApiZodBody(impersonateBody)
  @ApiZodOk(sessionResponse, 'Access token only (no refresh), at most 60 minutes')
  impersonate(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(impersonateBody)) body: z.infer<typeof impersonateBody>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.platform.impersonate(p, id, body, meta);
  }
}
