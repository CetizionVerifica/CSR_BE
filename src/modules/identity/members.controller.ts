import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentPrincipal } from '../../common/auth/current-principal';
import { Can, Public } from '../../common/auth/decorators';
import { type AuthenticatedPrincipal } from '../../common/auth/principal';
import { Idempotent } from '../../common/idempotency/idempotency.interceptor';
import { ReqMeta, type RequestMeta } from '../../common/http/request-meta';
import { paginationQuery } from '../../common/pagination';
import {
  ApiZodBody,
  ApiZodOk,
  ApiZodQuery,
  ApiZodResponse,
  ZodValidationPipe,
} from '../../common/validation/zod';
import {
  acceptInvitationBody,
  acceptInvitationResponse,
  invitation,
  invitationPage,
  inviteBody,
  inviteCsvBody,
  inviteResult,
  listMembersQuery,
  member,
  memberPage,
  updateMemberBody,
} from './dto/members.dto';
import { MembersService } from './members.service';

const uuid = new ZodValidationPipe(z.uuid());

/** M01 §8 `/workspaces/:wid/members|invitations`; `:wid` must be the current workspace (else 404). */
@ApiTags('members')
@ApiBearerAuth()
@Controller('workspaces/:wid')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Can('org:manage-users')
  @Get('members')
  @ApiZodQuery(listMembersQuery)
  @ApiZodOk(memberPage)
  list(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('wid', uuid) wid: string,
    @Query(new ZodValidationPipe(listMembersQuery)) q: z.infer<typeof listMembersQuery>,
  ) {
    return this.members.list(
      p,
      wid,
      { ...(q.role ? { role: q.role } : {}), ...(q.status ? { status: q.status } : {}) },
      q.cursor,
      q.limit,
    );
  }

  @Can('org:manage-users')
  @Patch('members/:id')
  @ApiZodBody(updateMemberBody)
  @ApiZodOk(member)
  update(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('wid', uuid) wid: string,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(updateMemberBody)) body: z.infer<typeof updateMemberBody>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.members.update(p, wid, id, body, meta);
  }

  @Can('org:manage-users')
  @Delete('members/:id')
  @HttpCode(204)
  @ApiNoContentResponse()
  async remove(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('wid', uuid) wid: string,
    @Param('id', uuid) id: string,
    @ReqMeta() meta: RequestMeta,
  ): Promise<void> {
    await this.members.remove(p, wid, id, meta);
  }

  @Can('org:manage-users')
  @Post('invitations')
  @HttpCode(201)
  @Idempotent()
  @ApiZodBody(inviteBody)
  @ApiZodResponse(201, inviteResult)
  invite(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('wid', uuid) wid: string,
    @Body(new ZodValidationPipe(inviteBody)) body: z.infer<typeof inviteBody>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.members.invite(p, wid, body.invitations, meta);
  }

  @Can('org:manage-users')
  @Post('invitations/csv')
  @HttpCode(201)
  @Idempotent()
  @ApiZodBody(inviteCsvBody)
  @ApiZodResponse(201, inviteResult)
  inviteCsv(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('wid', uuid) wid: string,
    @Body(new ZodValidationPipe(inviteCsvBody)) body: z.infer<typeof inviteCsvBody>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.members.inviteCsv(p, wid, body.csv, meta);
  }

  @Can('org:manage-users')
  @Get('invitations')
  @ApiZodQuery(paginationQuery)
  @ApiZodOk(invitationPage)
  invitations(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('wid', uuid) wid: string,
    @Query(new ZodValidationPipe(paginationQuery)) q: z.infer<typeof paginationQuery>,
  ) {
    return this.members.listInvitations(p, wid, q.cursor, q.limit);
  }

  @Can('org:manage-users')
  @Post('invitations/:id/resend')
  @HttpCode(200)
  @Idempotent()
  @ApiZodOk(invitation)
  resend(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('wid', uuid) wid: string,
    @Param('id', uuid) id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.members.resend(p, wid, id, meta);
  }

  @Can('org:manage-users')
  @Delete('invitations/:id')
  @HttpCode(204)
  @ApiNoContentResponse()
  async revoke(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('wid', uuid) wid: string,
    @Param('id', uuid) id: string,
    @ReqMeta() meta: RequestMeta,
  ): Promise<void> {
    await this.members.revokeInvitation(p, wid, id, meta);
  }
}

/** Public, token-gated invitation acceptance (US-01-1). */
@ApiTags('members')
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly members: MembersService) {}

  @Public()
  @Post('accept')
  @HttpCode(200)
  @ApiZodBody(acceptInvitationBody)
  @ApiZodOk(acceptInvitationResponse)
  accept(
    @Body(new ZodValidationPipe(acceptInvitationBody)) body: z.infer<typeof acceptInvitationBody>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.members.accept(body, meta);
  }
}
