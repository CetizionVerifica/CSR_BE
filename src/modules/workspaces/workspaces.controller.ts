import { Body, Controller, Delete, Get, HttpCode, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentPrincipal } from '../../common/auth/current-principal';
import { Authenticated, Can } from '../../common/auth/decorators';
import { type AuthenticatedPrincipal } from '../../common/auth/principal';
import { ReqMeta, type RequestMeta } from '../../common/http/request-meta';
import { ApiZodBody, ApiZodOk, ZodValidationPipe } from '../../common/validation/zod';
import { entitlementsResponse, partnerGrantList, updateWorkspaceBody, workspace } from './dto/workspaces.dto';
import { WorkspacesService } from './workspaces.service';

/** M02 §8 `/workspaces/current*`: the caller's current workspace (404 without one). */
@ApiTags('workspaces')
@ApiBearerAuth()
@Controller('workspaces/current')
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Authenticated()
  @Get()
  @ApiZodOk(workspace)
  current(@CurrentPrincipal() p: AuthenticatedPrincipal) {
    return this.workspaces.current(p);
  }

  @Can('workspace:manage')
  @Patch()
  @ApiZodBody(updateWorkspaceBody)
  @ApiZodOk(workspace)
  update(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Body(new ZodValidationPipe(updateWorkspaceBody)) body: z.infer<typeof updateWorkspaceBody>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.workspaces.update(p, body, meta);
  }

  @Authenticated()
  @Get('entitlements')
  @ApiZodOk(entitlementsResponse, 'Plan, modules, limits and current usage')
  entitlements(@CurrentPrincipal() p: AuthenticatedPrincipal) {
    return this.workspaces.entitlements(p);
  }

  @Can('workspace:manage')
  @Get('partner-grants')
  @ApiZodOk(partnerGrantList, 'Partners with an active grant to this workspace')
  partnerGrants(@CurrentPrincipal() p: AuthenticatedPrincipal) {
    return this.workspaces.partnerGrants(p);
  }

  @Can('workspace:manage')
  @Delete('partner-grants/:id')
  @HttpCode(204)
  @ApiNoContentResponse()
  async revokePartnerGrant(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('id', new ZodValidationPipe(z.uuid())) id: string,
    @ReqMeta() meta: RequestMeta,
  ): Promise<void> {
    await this.workspaces.revokePartnerGrant(p, id, meta);
  }
}
