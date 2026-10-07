import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentPrincipal } from '../../common/auth/current-principal';
import { Can } from '../../common/auth/decorators';
import { type AuthenticatedPrincipal } from '../../common/auth/principal';
import { ReqMeta, type RequestMeta } from '../../common/http/request-meta';
import { Idempotent } from '../../common/idempotency/idempotency.interceptor';
import {
  ApiZodBody,
  ApiZodOk,
  ApiZodQuery,
  ApiZodResponse,
  ZodValidationPipe,
} from '../../common/validation/zod';
import {
  createUploadBody,
  createVersionBody,
  downloadQuery,
  downloadResponse,
  fileDetail,
  filePage,
  listFilesQuery,
  uploadResponse,
} from './dto/files.dto';
import { FilesService } from './files.service';

const uuid = new ZodValidationPipe(z.uuid());

/**
 * M14 §4 `/files*` in the current workspace (RLS). Every route needs project:read; uploading,
 * replacing and deleting also need the purpose's permission (evidence:upload, company:update).
 */
@ApiTags('files')
@ApiBearerAuth()
@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Can('project:read')
  @Get()
  @ApiZodQuery(listFilesQuery)
  @ApiZodOk(filePage, 'Newest first; deleted files are not listed')
  list(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Query(new ZodValidationPipe(listFilesQuery)) q: z.infer<typeof listFilesQuery>,
  ) {
    return this.files.list(p, q);
  }

  @Can('project:read')
  @Post('uploads')
  @HttpCode(201)
  @ApiZodBody(createUploadBody)
  @ApiZodResponse(
    201,
    uploadResponse,
    'Pending file; PUT the content to upload.url, then POST /files/{id}/complete',
  )
  createUpload(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Body(new ZodValidationPipe(createUploadBody)) body: z.infer<typeof createUploadBody>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.files.createUpload(p, body, meta);
  }

  @Can('project:read')
  @Get(':id')
  @ApiZodOk(fileDetail)
  get(@CurrentPrincipal() p: AuthenticatedPrincipal, @Param('id', uuid) id: string) {
    return this.files.get(p, id);
  }

  @Can('project:read')
  @Post(':id/complete')
  @HttpCode(202)
  @Idempotent()
  @ApiZodResponse(
    202,
    fileDetail,
    'Upload verified; the malware scan runs in the background (status scanning)',
  )
  complete(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('id', uuid) id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.files.complete(p, id, meta);
  }

  @Can('project:read')
  @Post(':id/versions')
  @HttpCode(201)
  @ApiZodBody(createVersionBody)
  @ApiZodResponse(201, uploadResponse, 'Pending version; upload and complete it like a new file')
  createVersion(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(createVersionBody)) body: z.infer<typeof createVersionBody>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.files.createVersion(p, id, body, meta);
  }

  @Can('project:read')
  @Get(':id/download')
  @ApiZodQuery(downloadQuery)
  @ApiZodOk(downloadResponse, 'Short-lived link; evidence downloads are audited')
  download(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('id', uuid) id: string,
    @Query(new ZodValidationPipe(downloadQuery)) q: z.infer<typeof downloadQuery>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.files.download(p, id, q.versionId, meta);
  }

  @Can('project:read')
  @Delete(':id')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Soft-deleted; purged after 30 days' })
  async remove(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('id', uuid) id: string,
    @ReqMeta() meta: RequestMeta,
  ): Promise<void> {
    await this.files.remove(p, id, meta);
  }
}
