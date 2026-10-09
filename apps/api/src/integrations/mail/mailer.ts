import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * The email port. Feature modules depend on this abstract class only, so the
 * real transport (SMTP, Microsoft Graph, a provider SDK) is one new provider
 * bound in `MailModule` — nothing that sends mail changes.
 *
 * `send` rejects when the message was not handed to a transport; callers record
 * that as `email_status = FAILED` so an admin can see it and resend.
 */
export abstract class Mailer {
  abstract send(message: MailMessage): Promise<void>;
}

/**
 * Development stand-in: writes each message to the server log so a developer
 * can follow an invite or reset link end to end.
 *
 * Outside development and test it refuses to "send". A one-time link is a
 * credential, and production logs are not a place for credentials — so until a
 * real transport is bound, delivery fails loudly (and visibly, as FAILED on the
 * Users tab) instead of leaking the token into log storage.
 */
@Injectable()
export class DevOutboxMailer extends Mailer {
  private readonly logger = new Logger('DevOutbox');

  constructor(private readonly config: ConfigService) {
    super();
  }

  send(message: MailMessage): Promise<void> {
    const env = this.config.get<string>('nodeEnv', 'development');
    if (env !== 'development' && env !== 'test') {
      this.logger.warn(`No email transport is configured; "${message.subject}" was not sent.`);
      return Promise.reject(new Error('No email transport configured'));
    }
    if (env === 'development') {
      this.logger.log(`[dev outbox] ${message.subject} -> ${message.to}\n${message.text}`);
    }
    const outbox = process.env['E2E_MAIL_OUTBOX'];
    if (outbox) return this.appendToOutbox(outbox, message);
    return Promise.resolve();
  }

  /**
   * `E2E_MAIL_OUTBOX` (a file path; development/test only) appends each message
   * as one JSON line, so the Playwright suite can follow an invite or reset link
   * the way a user would. Nothing is sent anywhere.
   */
  private async appendToOutbox(file: string, message: MailMessage): Promise<void> {
    await mkdir(path.dirname(file), { recursive: true });
    await appendFile(file, `${JSON.stringify({ ...message, at: new Date().toISOString() })}\n`);
  }
}
