import { Global, Module } from '@nestjs/common';
import { DevOutboxMailer, Mailer } from './mailer.js';

/**
 * Binds the `Mailer` port. To switch to real email, add the transport's
 * provider here (`{ provide: Mailer, useClass: SmtpMailer }`); no feature
 * module changes.
 */
@Global()
@Module({
  providers: [{ provide: Mailer, useClass: DevOutboxMailer }],
  exports: [Mailer],
})
export class MailModule {}
