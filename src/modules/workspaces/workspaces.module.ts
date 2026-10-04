import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { CompaniesController } from './companies.controller';
import { CompaniesRepository } from './companies.repository';
import { CompaniesService } from './companies.service';
import { PartnerController } from './partner.controller';
import { PartnerService } from './partner.service';
import { PlatformWorkspacesController } from './platform-workspaces.controller';
import { PlatformWorkspacesService } from './platform-workspaces.service';
import { ReferenceController } from './reference.controller';
import { ReferenceRepository } from './reference.repository';
import { WorkspacesController } from './workspaces.controller';
import { WorkspacesRepository } from './workspaces.repository';
import { WorkspacesService } from './workspaces.service';

/** M02 — Workspaces, companies, entitlements & partners. */
@Module({
  imports: [IdentityModule],
  controllers: [
    WorkspacesController,
    CompaniesController,
    PartnerController,
    ReferenceController,
    PlatformWorkspacesController,
  ],
  providers: [
    CompaniesRepository,
    CompaniesService,
    PartnerService,
    PlatformWorkspacesService,
    ReferenceRepository,
    WorkspacesRepository,
    WorkspacesService,
  ],
})
export class WorkspacesModule {}
