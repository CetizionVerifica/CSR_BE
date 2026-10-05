/** Audit actions / domain events of M02 §10 (written to audit_events, M12). Names are stable. */
export const WorkspaceEvents = {
  workspaceCreated: 'workspace.created',
  workspaceUpdated: 'workspace.updated',
  workspaceSuspended: 'workspace.suspended',
  companyCreated: 'company.created',
  companyUpdated: 'company.updated',
  companyDeleted: 'company.deleted',
  companyRestored: 'company.restored',
  entitlementsChanged: 'entitlements.changed',
  partnerGrantCreated: 'partner_grant.created',
  partnerGrantRevoked: 'partner_grant.revoked',
} as const;
