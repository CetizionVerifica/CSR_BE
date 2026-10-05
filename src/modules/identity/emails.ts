import { type EmailJob } from '../../infra/queue/queues';

/**
 * Transactional identity emails (M01 §10). Plain templates until M12 brings localised React Email
 * templates; links point at the SPA routes of M01 §9.
 */
const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function transactionalEmail(
  to: string,
  subject: string,
  lines: string[],
  link?: { url: string; label: string },
): EmailJob {
  const text = [...lines, ...(link ? ['', `${link.label}: ${link.url}`] : [])].join('\n');
  const html = [
    ...lines.map((l) => `<p>${esc(l)}</p>`),
    ...(link ? [`<p><a href="${esc(link.url)}">${esc(link.label)}</a></p>`] : []),
  ].join('\n');
  return { to, subject, html, text, stream: 'outbound' };
}

export const identityEmails = {
  invitation: (to: string, p: { workspaceName: string; inviterName: string; url: string }) =>
    transactionalEmail(
      to,
      `You're invited to ${p.workspaceName} on ResiliSense`,
      [
        `${p.inviterName} invited you to join ${p.workspaceName} on ResiliSense.`,
        'The invitation is valid for 7 days.',
      ],
      { url: p.url, label: 'Accept invitation' },
    ),
  passwordReset: (to: string, p: { url: string }) =>
    transactionalEmail(
      to,
      'Reset your ResiliSense password',
      [
        'We received a request to reset your password. The link is valid for 15 minutes and can be used once.',
        'If you did not ask for this, ignore this email.',
      ],
      { url: p.url, label: 'Reset password' },
    ),
  passwordChanged: (to: string) =>
    transactionalEmail(to, 'Your ResiliSense password was changed', [
      'Your password was changed and your other sessions were signed out.',
      'If this was not you, reset your password immediately and contact support.',
    ]),
  verifyEmail: (to: string, p: { url: string }) =>
    transactionalEmail(
      to,
      'Confirm your email address',
      ['Confirm your email address to finish setting up ResiliSense. The link is valid for 24 hours.'],
      {
        url: p.url,
        label: 'Confirm email',
      },
    ),
  accountExists: (to: string, p: { signInUrl: string; resetUrl: string }) =>
    transactionalEmail(
      to,
      'You already have a ResiliSense account',
      [
        'Someone (hopefully you) tried to sign up with this email address, which already has an account.',
        `Forgot your password? Reset it at ${p.resetUrl}`,
      ],
      { url: p.signInUrl, label: 'Sign in' },
    ),
  emailChanged: (to: string) =>
    transactionalEmail(to, 'Your ResiliSense email address was changed', [
      'The email address of your ResiliSense account was changed. If this was not you, contact support immediately.',
    ]),
  mfaChanged: (to: string, enabled: boolean) =>
    transactionalEmail(to, `Two-factor authentication ${enabled ? 'enabled' : 'disabled'}`, [
      `Two-factor authentication was ${enabled ? 'enabled' : 'disabled'} on your ResiliSense account.`,
      'If this was not you, reset your password immediately and contact support.',
    ]),
};
