/**
 * Transactional email behind a provider-neutral interface (ADR-010, M12).
 * Drivers: `postmark` (default in production), `smtp` (any provider via Nodemailer),
 * `log` (development/tests — prints a redacted summary, sends nothing). Never AWS SES.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  /** Provider tag / message stream, e.g. "transactional", "survey-invite". */
  stream?: string;
}

export interface EmailSendResult {
  provider: 'postmark' | 'smtp' | 'log';
  providerMessageId?: string;
}

export interface EmailAdapter {
  send(message: EmailMessage): Promise<EmailSendResult>;
}

export const EMAIL_ADAPTER = Symbol('EMAIL_ADAPTER');

/** For logs: never log full addresses or bodies. */
export function maskEmail(address: string): string {
  const [user = '', domain = ''] = address.split('@');
  return `${user.slice(0, 1)}***@${domain}`;
}
