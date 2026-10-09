import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { type AuthenticatedPrincipal } from '../../common/auth/principal';
import { ProblemError } from '../../common/errors/problem';
import { type RequestMeta } from '../../common/http/request-meta';
import { uuidv7 } from '../../common/ids';
import { type Prisma } from '../../generated/prisma/client';
import { AuditService } from '../audit';
import {
  AuthEvents,
  encodeTenantToken,
  expiresAt,
  hashToken,
  identityEmails,
  IdentityMailer,
  slugify,
  TTL,
  UsersRepository,
} from '../identity';
import { actorOf, currentWorkspace, invalid, limitExceeded } from './access';
import { CompaniesRepository } from './companies.repository';
import { type CreateClientInput } from './dto/partner.dto';
import { isPartnerWorkspace, parseLimits, withinLimit } from './engine/limits';
import { WorkspaceEvents } from './events';
import { ReferenceRepository } from './reference.repository';
import { WorkspacesRepository } from './workspaces.repository';

/** Starting limits of a partner-onboarded client until the platform owner sets its plan (M02 §7). */
const CLIENT_LIMITS = { companies: 1, users: 5, projectsPerYear: 1 };

/**
 * Partner console (legacy reseller, M02 §4.1, US-02-1): the current workspace is the partner; it
 * onboards client workspaces within `limits.clientWorkspaces` and keeps a grant to each.
 */
@Injectable()
export class PartnerService {
  constructor(
    private readonly workspaces: WorkspacesRepository,
    private readonly companies: CompaniesRepository,
    private readonly reference: ReferenceRepository,
    private readonly users: UsersRepository,
    private readonly audit: AuditService,
    private readonly mailer: IdentityMailer,
  ) {}

  private async partnerLimit(wid: string): Promise<number> {
    const limits = parseLimits((await this.workspaces.entitlement(wid))?.limits);
    if (!isPartnerWorkspace(limits))
      throw new ProblemError(
        'forbidden',
        'Not a partner workspace',
        'The plan does not include client workspaces',
      );
    return limits.clientWorkspaces!;
  }

  async list(p: AuthenticatedPrincipal, cursor: string | undefined, limit: number) {
    const wid = currentWorkspace(p);
    const max = await this.partnerLimit(wid);
    const rows = await this.workspaces.grantsGiven(wid, cursor, limit + 1);
    const items = rows.slice(0, limit);
    const out = [];
    for (const g of items) {
      const stats = await this.workspaces.clientStats(g.clientWorkspaceId);
      out.push({
        grantId: g.id,
        workspaceId: g.clientWorkspaceId,
        name: g.clientWorkspace.name,
        status: g.clientWorkspace.status,
        companies: stats.companies,
        lastActivityAt: stats.lastActivityAt?.toISOString() ?? null,
        createdAt: g.createdAt.toISOString(),
      });
    }
    return {
      items: out,
      nextCursor: rows.length > limit ? items[items.length - 1]!.id : null,
      usage: { clientWorkspaces: await this.workspaces.countActiveGrants(wid), limit: max },
    };
  }

  async create(p: AuthenticatedPrincipal, input: CreateClientInput, meta: RequestMeta) {
    const partnerId = currentWorkspace(p);
    const max = await this.partnerLimit(partnerId);
    const partnerEnt = await this.workspaces.entitlement(partnerId);
    if (!(await this.reference.countryExists(input.workspace.country)))
      throw invalid('workspace.country', 'Unknown country');
    if (!(await this.reference.sectorExists(input.company.sectorCode)))
      throw invalid('company.sectorCode', 'Unknown sector');
    if (!(await this.reference.countryExists(input.company.country)))
      throw invalid('company.country', 'Unknown country');
    if (input.company.parentCompanyId)
      throw invalid('company.parentCompanyId', 'A new workspace has no companies yet');

    const now = new Date();
    const workspaceId = uuidv7();
    const token = encodeTenantToken(workspaceId, randomBytes(32));
    const { parentCompanyId: _parent, ...companyInput } = input.company;
    const created = await this.workspaces.createClient(
      {
        workspaceId,
        partnerWorkspaceId: partnerId,
        grantedBy: p.userId,
        workspace: {
          name: input.workspace.name,
          slug: slugify(input.workspace.name),
          status: 'active',
          country: input.workspace.country,
          defaultLocale: input.workspace.defaultLocale,
          timezone: input.workspace.timezone,
          dataRegion: input.workspace.dataRegion,
        },
        // Clients get the partner's modules (a partner cannot grant more than it has, M02 §7).
        entitlement: { plan: 'partner_client', modules: partnerEnt?.modules ?? [], limits: CLIENT_LIMITS },
        invitation: {
          email: input.owner.email,
          tokenHash: hashToken(token),
          expiresAt: expiresAt(now, TTL.invitationMs),
        },
      },
      async (tx) => {
        if (!withinLimit(max, await this.workspaces.countActiveGrants(partnerId, tx)))
          throw limitExceeded('clientWorkspaces', max, 'Client workspace limit reached');
      },
      (tx) =>
        this.companies.createInTx(tx, workspaceId, {
          ...(companyInput as Omit<Prisma.CompanyUncheckedCreateInput, 'id' | 'workspaceId'>),
          displayName: companyInput.displayName ?? companyInput.legalName,
        }),
    );

    const actor = actorOf(p);
    await this.audit.record(
      [
        {
          action: WorkspaceEvents.workspaceCreated,
          entityType: 'workspace',
          entityId: created.workspaceId,
          workspaceId: created.workspaceId,
          actor,
          diff: { createdVia: 'partner', partnerWorkspaceId: partnerId },
        },
        {
          action: WorkspaceEvents.partnerGrantCreated,
          entityType: 'partner_grant',
          entityId: created.grantId,
          workspaceId: created.workspaceId,
          actor,
          diff: { partnerWorkspaceId: partnerId },
        },
        {
          action: WorkspaceEvents.partnerGrantCreated,
          entityType: 'partner_grant',
          entityId: created.grantId,
          workspaceId: partnerId,
          actor,
          diff: { clientWorkspaceId: created.workspaceId },
        },
        {
          action: WorkspaceEvents.companyCreated,
          entityType: 'company',
          entityId: created.companyId,
          workspaceId: created.workspaceId,
          actor,
        },
        {
          action: AuthEvents.userInvited,
          entityType: 'invitation',
          entityId: created.invitationId,
          workspaceId: created.workspaceId,
          actor,
          diff: { role: 'workspace_owner' },
        },
      ],
      meta,
    );
    const inviter = await this.users.findById(p.userId);
    await this.mailer.send(
      identityEmails.invitation(input.owner.email, {
        workspaceName: input.workspace.name,
        inviterName: inviter?.name ?? 'Your partner',
        url: this.mailer.link('/accept-invite', token),
      }),
    );
    return created;
  }
}
