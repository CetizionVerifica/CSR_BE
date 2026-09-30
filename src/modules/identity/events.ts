/**
 * Audit actions / domain events of M01 §10 (written to audit_events, M12). Names are stable:
 * the activity feed and the auditor UI filter on them.
 */
export const AuthEvents = {
  loginSucceeded: 'auth.login.succeeded',
  loginFailed: 'auth.login.failed',
  logout: 'auth.logout',
  refreshReuseDetected: 'auth.refresh.reuse_detected',
  passwordResetRequested: 'auth.password.reset.requested',
  passwordResetCompleted: 'auth.password.reset.completed',
  passwordChanged: 'auth.password.changed',
  mfaEnabled: 'auth.mfa.enabled',
  mfaDisabled: 'auth.mfa.disabled',
  signup: 'user.signed_up',
  emailVerified: 'user.email.verified',
  emailChanged: 'user.email.changed',
  termsAccepted: 'user.terms.accepted',
  profileUpdated: 'user.profile.updated',
  sessionRevoked: 'auth.session.revoked',
  userInvited: 'user.invited',
  invitationRevoked: 'invitation.revoked',
  invitationAccepted: 'invitation.accepted',
  membershipCreated: 'membership.created',
  membershipUpdated: 'membership.updated',
  membershipRemoved: 'membership.removed',
  workspaceCreated: 'workspace.created',
  workspaceSwitched: 'workspace.switched',
  platformUserUpdated: 'platform.user.updated',
  impersonationStarted: 'impersonation.started',
  impersonationEnded: 'impersonation.ended',
  crossTenantAccess: 'platform.cross_tenant_access',
} as const;
