import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { type z } from 'zod';
import { CurrentPrincipal } from '../../common/auth/current-principal';
import { Can } from '../../common/auth/decorators';
import { type AuthenticatedPrincipal } from '../../common/auth/principal';
import { Idempotent } from '../../common/idempotency/idempotency.interceptor';
import { ReqMeta, type RequestMeta } from '../../common/http/request-meta';
import {
  ApiZodBody,
  ApiZodOk,
  ApiZodQuery,
  ApiZodResponse,
  ZodValidationPipe,
} from '../../common/validation/zod';
import {
  createClientBody,
  createClientResponse,
  listClientsQuery,
  partnerClientPage,
} from './dto/partner.dto';
import { PartnerService } from './partner.service';

/** M02 §8 `/partner/clients`: the current workspace acting as a partner (US-02-1). */
@ApiTags('partner')
@ApiBearerAuth()
@Can('partner:manage')
@Controller('partner/clients')
export class PartnerController {
  constructor(private readonly partner: PartnerService) {}

  @Get()
  @ApiZodQuery(listClientsQuery)
  @ApiZodOk(partnerClientPage)
  list(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Query(new ZodValidationPipe(listClientsQuery)) q: z.infer<typeof listClientsQuery>,
  ) {
    return this.partner.list(p, q.cursor, q.limit);
  }

  @Post()
  @HttpCode(201)
  @Idempotent()
  @ApiZodBody(createClientBody)
  @ApiZodResponse(201, createClientResponse, 'Client workspace created; the owner was invited by email')
  create(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Body(new ZodValidationPipe(createClientBody)) body: z.infer<typeof createClientBody>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.partner.create(p, body, meta);
  }
}
