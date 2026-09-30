import { Global, Module } from '@nestjs/common';
import { AppConfig } from '../../config/app-config';
import { LogEmailAdapter, PostmarkEmailAdapter, SmtpEmailAdapter } from './drivers';
import { EMAIL_ADAPTER, type EmailAdapter } from './email.adapter';

@Global()
@Module({
  providers: [
    {
      provide: EMAIL_ADAPTER,
      inject: [AppConfig],
      useFactory: (config: AppConfig): EmailAdapter => {
        const from = config.get('EMAIL_FROM');
        switch (config.get('EMAIL_DRIVER')) {
          case 'postmark':
            return new PostmarkEmailAdapter(config.get('POSTMARK_SERVER_TOKEN')!, from);
          case 'smtp':
            return new SmtpEmailAdapter(config.get('SMTP_URL')!, from);
          default:
            return new LogEmailAdapter();
        }
      },
    },
  ],
  exports: [EMAIL_ADAPTER],
})
export class EmailModule {}
