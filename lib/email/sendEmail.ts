import nodemailer, { type Transporter } from 'nodemailer';
import { env, requireEnv } from '@/lib/env';
import { createGraphMailer, type GraphMailer } from '@/lib/email/graphMail';

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

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

// Created on first use and kept for the life of the server process so its access token is reused
// across sends instead of being re-requested for every email.
let graphMailer: GraphMailer | null = null;

function getGraphMailer(): GraphMailer {
  if (!graphMailer) {
    graphMailer = createGraphMailer({
      tenantId: requireEnv('GRAPH_TENANT_ID'),
      clientId: requireEnv('GRAPH_CLIENT_ID'),
      clientSecret: requireEnv('GRAPH_CLIENT_SECRET'),
      sender: requireEnv('GRAPH_SENDER'),
    });
  }
  return graphMailer;
}

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
 * Sends one transactional email. The transport is chosen by EMAIL_PROVIDER: 'brevo' (default, SMTP
 * relay) or 'graph' (Microsoft Graph, sent as the shared mailbox GRAPH_SENDER).
 *
 * Swallows and logs failures rather than throwing — a broken email provider (missing key, rate
 * limit, unverified sender, denied mailbox) must never block or roll back the real action it's
 * attached to, same principle as notifyUser/notifyReviewers (lib/notifications.ts).
 *
 * Returns whether the message was actually accepted by the provider. Notification callers ignore
 * this, but anything whose entire purpose *is* the email — inviting an employee — must check it
 * rather than reporting success for mail that never left.
 */
export async function sendEmail(to: string, content: EmailContent): Promise<boolean> {
  if (env.EMAIL_PROVIDER === 'graph') return sendViaGraph(to, content);
  return sendViaBrevo(to, content);
}

async function sendViaBrevo(to: string, content: EmailContent): Promise<boolean> {
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

/**
 * Microsoft Graph transport. The message goes out AS the shared mailbox (GRAPH_SENDER), so its
 * display name is the mailbox's, not EMAIL_FROM_NAME. Graph carries one body, so the HTML part is
 * sent and `text` is not (the HTML templates are self-contained). Failure handling mirrors Brevo:
 * log and return false, never throw. Only status/code/request-id are logged, never the recipient
 * or any secret.
 */
async function sendViaGraph(to: string, content: EmailContent): Promise<boolean> {
  try {
    const result = await getGraphMailer().send(to, {
      subject: content.subject,
      html: content.html,
      attachments: content.attachments,
    });
    if (!result.ok) {
      console.error(
        `Failed to send email via Microsoft Graph: ${result.errorCode ?? 'unknown'} (HTTP ${result.status ?? 'n/a'}, attempts ${result.attempts}, request-id ${result.requestId ?? 'n/a'}): ${result.message ?? ''}`
      );
    }
    return result.ok;
  } catch (err) {
    // Typically a missing GRAPH_* setting (requireEnv). Surfaces as a failed send, not a crash.
    console.error('Failed to send email via Microsoft Graph:', err instanceof Error ? err.message : err);
    return false;
  }
}
