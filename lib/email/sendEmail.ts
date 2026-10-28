import nodemailer, { type Transporter } from 'nodemailer';
import { env, requireEnv } from '@/lib/env';

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
  /** Optional files (e.g. the assessment certificate PDF). Existing callers never set this. */
  attachments?: EmailAttachment[];
}

let transporter: Transporter | null = null;

/** Brevo's SMTP relay, authenticated with the SMTP key (BREVO_SMTP_KEY — starts with
 *  `xsmtpsib-`), not the REST API key. The login (BREVO_SMTP_LOGIN, looks like
 *  <id>@smtp-brevo.com) is a separate account-level credential from the visible From address —
 *  Brevo will reject auth if EMAIL_FROM_ADDRESS is used as the login instead. */
function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: 'smtp-relay.brevo.com',
      port: 587,
      secure: false,
      auth: {
        user: requireEnv('BREVO_SMTP_LOGIN'),
        pass: requireEnv('BREVO_SMTP_KEY'),
      },
    });
  }
  return transporter;
}

/**
 * Sends one transactional email via Brevo's SMTP relay. Swallows and logs failures rather than
 * throwing — a broken email provider (missing key, rate limit, unverified sender) must never
 * block or roll back the real action it's attached to, same principle as
 * notifyUser/notifyReviewers (lib/notifications.ts).
 *
 * Returns whether the message was actually handed to Brevo. Notification callers ignore this,
 * but anything whose entire purpose *is* the email — inviting an employee — must check it
 * rather than reporting success for mail that never left.
 */
export async function sendEmail(to: string, content: EmailContent): Promise<boolean> {
  try {
    const fromAddress = requireEnv('EMAIL_FROM_ADDRESS');
    await getTransporter().sendMail({
      from: `"${env.EMAIL_FROM_NAME}" <${fromAddress}>`,
      to,
      subject: content.subject,
      html: content.html,
      text: content.text,
      attachments: content.attachments,
    });
    return true;
  } catch (err) {
    console.error('Failed to send email:', err);
    return false;
  }
}
