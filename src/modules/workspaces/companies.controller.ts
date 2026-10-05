import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentPrincipal } from '../../common/auth/current-principal';
import { Can } from '../../common/auth/decorators';
import { type AuthenticatedPrincipal } from '../../common/auth/principal';
import { ReqMeta, type RequestMeta } from '../../common/http/request-meta';
import {
  ApiZodBody,
  ApiZodOk,
  ApiZodQuery,
  ApiZodResponse,
  ZodValidationPipe,
} from '../../common/validation/zod';
import { CompaniesService } from './companies.service';
import {
  activityPage,
  activityQuery,
  company,
  companyPage,
  createCompanyBody,
  deleteCompanyQuery,
  listCompaniesQuery,
  updateCompanyBody,
} from './dto/companies.dto';

const uuid = new ZodValidationPipe(z.uuid());

/** M02 §8 `/companies*` in the current workspace (RLS); contributors see their scoped companies only. */
@ApiTags('companies')
@ApiBearerAuth()
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Can('project:read')
  @Get()
  @ApiZodQuery(listCompaniesQuery)
  @ApiZodOk(companyPage)
  list(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Query(new ZodValidationPipe(listCompaniesQuery)) q: z.infer<typeof listCompaniesQuery>,
  ) {
    return this.companies.list(p, q);
  }

  @Can('company:create')
  @Post()
  @HttpCode(201)
  @ApiZodBody(createCompanyBody)
  @ApiZodResponse(201, company)
  create(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Body(new ZodValidationPipe(createCompanyBody)) body: z.infer<typeof createCompanyBody>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.companies.create(p, body, meta);
  }

  @Can('project:read')
  @Get(':id')
  @ApiZodOk(company)
  get(@CurrentPrincipal() p: AuthenticatedPrincipal, @Param('id', uuid) id: string) {
    return this.companies.get(p, id);
  }

  @Can('company:update')
  @Patch(':id')
  @ApiZodBody(updateCompanyBody)
  @ApiZodOk(company)
  update(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(updateCompanyBody)) body: z.infer<typeof updateCompanyBody>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.companies.update(p, id, body, meta);
  }

  @Can('company:update')
  @Delete(':id')
  @ApiZodQuery(deleteCompanyQuery)
  @ApiZodOk(company, 'Soft-deleted; restorable until restorableUntil')
  remove(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('id', uuid) id: string,
    @Query(new ZodValidationPipe(deleteCompanyQuery)) q: z.infer<typeof deleteCompanyQuery>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.companies.remove(p, id, q.confirmName, meta);
  }

  @Can('company:update')
  @Post(':id/restore')
  @HttpCode(200)
  @ApiZodOk(company)
  restore(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('id', uuid) id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.companies.restore(p, id, meta);
  }

  @Can('project:read')
  @Get(':id/activity')
  @ApiZodQuery(activityQuery)
  @ApiZodOk(activityPage, 'Newest first, from audit events')
  activity(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('id', uuid) id: string,
    @Query(new ZodValidationPipe(activityQuery)) q: z.infer<typeof activityQuery>,
  ) {
    return this.companies.activity(p, id, q.cursor, q.limit);
  }
}
