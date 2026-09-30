import { Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { type EmailAdapter, type EmailMessage, type EmailSendResult, maskEmail } from './email.adapter';

/** Development/test driver: records messages in memory and logs a redacted line. */
export class LogEmailAdapter implements EmailAdapter {
  private readonly logger = new Logger('Email');
  readonly sent: EmailMessage[] = [];

  send(message: EmailMessage): Promise<EmailSendResult> {
    this.sent.push(message);
    this.logger.log(`[log driver] to=${maskEmail(message.to)} subject="${message.subject}"`);
    return Promise.resolve({ provider: 'log' });
  }
}

export class SmtpEmailAdapter implements EmailAdapter {
  private readonly transport: Transporter;

  constructor(
    smtpUrl: string,
    private readonly from: string,
  ) {
    this.transport = createTransport(smtpUrl);
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const info = (await this.transport.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      replyTo: message.replyTo,
    })) as { messageId?: string };
    return { provider: 'smtp', ...(info.messageId ? { providerMessageId: info.messageId } : {}) };
  }
}

export class PostmarkEmailAdapter implements EmailAdapter {
  constructor(
    private readonly serverToken: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const res = await this.fetchImpl('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-postmark-server-token': this.serverToken,
      },
      body: JSON.stringify({
        From: this.from,
        To: message.to,
        Subject: message.subject,
        HtmlBody: message.html,
        TextBody: message.text,
        ReplyTo: message.replyTo,
        MessageStream: message.stream ?? 'outbound',
      }),
    });
    const body = (await res.json()) as { MessageID?: string; ErrorCode?: number; Message?: string };
    if (!res.ok || (body.ErrorCode ?? 0) !== 0) {
      throw new Error(`Postmark rejected message (status ${res.status}, code ${body.ErrorCode ?? 'n/a'})`);
    }
    return { provider: 'postmark', ...(body.MessageID ? { providerMessageId: body.MessageID } : {}) };
  }
}
