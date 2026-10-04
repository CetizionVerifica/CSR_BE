import { transactionalEmail } from '../identity/emails';

/** M02 emails (§5 US-02-2). Plain templates until M12 brings localised templates. */
export const workspaceEmails = {
  partnerAccessRevoked: (to: string, p: { clientName: string; partnerName: string }) =>
    transactionalEmail(to, `${p.clientName} revoked your partner access`, [
      `${p.clientName} revoked the access of ${p.partnerName} to their ResiliSense workspace.`,
      'You no longer see or manage this workspace.',
    ]),
};
