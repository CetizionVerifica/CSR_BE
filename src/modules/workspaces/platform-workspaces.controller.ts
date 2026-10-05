import { Body, Controller, Get, Param, Patch, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentPrincipal } from '../../common/auth/current-principal';
import { Can } from '../../common/auth/decorators';
import { type AuthenticatedPrincipal } from '../../common/auth/principal';
import { ReqMeta, type RequestMeta } from '../../common/http/request-meta';
import { ApiZodBody, ApiZodOk, ApiZodQuery, ZodValidationPipe } from '../../common/validation/zod';
import {
  listPlatformWorkspacesQuery,
  platformEntitlements,
  platformWorkspace,
  platformWorkspacePage,
  putEntitlementsBody,
  updatePlatformWorkspaceBody,
} from './dto/workspaces.dto';
import { PlatformWorkspacesService } from './platform-workspaces.service';

const uuid = new ZodValidationPipe(z.uuid());

/** M02 §8 `/platform/workspaces*` (platform owners only; every change audited). */
@ApiTags('platform')
@ApiBearerAuth()
@Can('platform:*')
@Controller('platform/workspaces')
export class PlatformWorkspacesController {
  constructor(private readonly platform: PlatformWorkspacesService) {}

  @Get()
  @ApiZodQuery(listPlatformWorkspacesQuery)
  @ApiZodOk(platformWorkspacePage)
  list(
    @Query(new ZodValidationPipe(listPlatformWorkspacesQuery)) q: z.infer<typeof listPlatformWorkspacesQuery>,
  ) {
    return this.platform.list({ q: q.q, status: q.status }, q.cursor, q.limit);
  }

  @Patch(':id')
  @ApiZodBody(updatePlatformWorkspaceBody)
  @ApiZodOk(platformWorkspace)
  update(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(updatePlatformWorkspaceBody))
    body: z.infer<typeof updatePlatformWorkspaceBody>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.platform.update(p, id, body, meta);
  }

  @Put(':id/entitlements')
  @ApiZodBody(putEntitlementsBody)
  @ApiZodOk(platformEntitlements)
  putEntitlements(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(putEntitlementsBody)) body: z.infer<typeof putEntitlementsBody>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.platform.putEntitlements(p, id, body, meta);
  }
}
