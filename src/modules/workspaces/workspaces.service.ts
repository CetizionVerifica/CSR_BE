import { Injectable } from '@nestjs/common';
import { type AuthenticatedPrincipal, MODULES, type ModuleName } from '../../common/auth/principal';
import { type RequestMeta } from '../../common/http/request-meta';
import { type Prisma, type Workspace } from '../../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { usedMegabytes } from '../files/engine/file-rules';
import { FilesService } from '../files/files.service';
import { IdentityMailer } from '../identity/identity-mailer';
import { actorOf, currentWorkspace, invalid, notFound } from './access';
import { CompaniesRepository } from './companies.repository';
import { type UpdateWorkspaceInput } from './dto/workspaces.dto';
import { workspaceEmails } from './emails';
import { parseLimits } from './engine/limits';
import { WorkspaceEvents } from './events';
import { ReferenceRepository } from './reference.repository';
import { WorkspacesRepository } from './workspaces.repository';

type Branding = { accentColor?: string | null; reportFooter?: string | null };

export const toWorkspace = (w: Workspace) => ({
  id: w.id,
  name: w.name,
  slug: w.slug,
  status: w.status,
  country: w.country,
  defaultLocale: w.defaultLocale,
  timezone: w.timezone,
  dataRegion: w.dataRegion,
  trialEndsAt: w.trialEndsAt?.toISOString() ?? null,
  createdVia: w.createdVia,
  logoFileId: w.logoFileId,
  branding: (w.branding as Branding | null) ?? {},
  createdAt: w.createdAt.toISOString(),
  updatedAt: w.updatedAt.toISOString(),
});

export const knownModules = (list: string[]): ModuleName[] =>
  list.filter((m): m is ModuleName => (MODULES as readonly string[]).includes(m));

/** The current workspace: profile, branding, plan & usage, partner grants (M02 §4.1, §8; US-02-2). */
@Injectable()
export class WorkspacesService {
  constructor(
    private readonly workspaces: WorkspacesRepository,
    private readonly companies: CompaniesRepository,
    private readonly reference: ReferenceRepository,
    private readonly audit: AuditService,
    private readonly mailer: IdentityMailer,
    private readonly files: FilesService,
  ) {}

  private async mustGet(p: AuthenticatedPrincipal): Promise<Workspace> {
    const w = await this.workspaces.find(currentWorkspace(p));
    if (!w) throw notFound();
    return w;
  }

  async current(p: AuthenticatedPrincipal) {
    return toWorkspace(await this.mustGet(p));
  }

  async update(p: AuthenticatedPrincipal, input: UpdateWorkspaceInput, meta: RequestMeta) {
    const w = await this.mustGet(p);
    if (input.country && !(await this.reference.countryExists(input.country)))
      throw invalid('country', 'Unknown country');
    if (input.logoFileId) await this.files.assertLogo(w.id, input.logoFileId);
    const data: Prisma.WorkspaceUncheckedUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.country !== undefined) data.country = input.country;
    if (input.defaultLocale !== undefined) data.defaultLocale = input.defaultLocale;
    if (input.timezone !== undefined) data.timezone = input.timezone;
    if (input.logoFileId !== undefined) data.logoFileId = input.logoFileId;
    if (input.branding !== undefined)
      data.branding = { ...((w.branding as Branding | null) ?? {}), ...input.branding };
    const updated = await this.workspaces.update(w.id, data);
    await this.audit.record(
      {
        action: WorkspaceEvents.workspaceUpdated,
        entityType: 'workspace',
        entityId: w.id,
        workspaceId: w.id,
        actor: actorOf(p),
        diff: { fields: Object.keys(input) },
      },
      meta,
    );
    if (input.logoFileId !== undefined && w.logoFileId !== input.logoFileId)
      await this.files.retireLogo(w.id, w.logoFileId, actorOf(p), meta);
    return toWorkspace(updated);
  }

  async entitlements(p: AuthenticatedPrincipal) {
    const w = await this.mustGet(p);
    const ent = await this.workspaces.entitlement(w.id);
    const now = new Date();
    return {
      plan: ent?.plan ?? 'none',
      modules: knownModules(ent?.modules ?? []),
      limits: parseLimits(ent?.limits),
      trialEndsAt: w.trialEndsAt?.toISOString() ?? null,
      usage: {
        companies: await this.companies.countActive(w.id),
        users: await this.workspaces.seats(w.id, now),
        clientWorkspaces: await this.workspaces.countActiveGrants(w.id),
        storageMb: usedMegabytes(await this.files.storedBytes(w.id)),
      },
    };
  }

  async partnerGrants(p: AuthenticatedPrincipal) {
    const rows = await this.workspaces.grantsReceived(currentWorkspace(p));
    return {
      items: rows.map((g) => ({
        id: g.id,
        partnerWorkspaceId: g.partnerWorkspaceId,
        partnerName: g.partnerWorkspace.name,
        createdAt: g.createdAt.toISOString(),
      })),
    };
  }

  /** US-02-2: effective on the partner's next request (grants are re-checked per request). */
  async revokePartnerGrant(p: AuthenticatedPrincipal, grantId: string, meta: RequestMeta): Promise<void> {
    const w = await this.mustGet(p);
    const now = new Date();
    const grant = await this.workspaces.revokeGrant(w.id, grantId, now);
    if (!grant) throw notFound();
    await this.audit.record(
      {
        action: WorkspaceEvents.partnerGrantRevoked,
        entityType: 'partner_grant',
        entityId: grant.id,
        workspaceId: w.id,
        actor: actorOf(p),
        diff: { partnerWorkspaceId: grant.partnerWorkspaceId },
      },
      meta,
    );
    for (const to of await this.workspaces.adminEmails(grant.partnerWorkspaceId, now)) {
      await this.mailer.send(
        workspaceEmails.partnerAccessRevoked(to, {
          clientName: w.name,
          partnerName: grant.partnerWorkspace.name,
        }),
      );
    }
  }
}
