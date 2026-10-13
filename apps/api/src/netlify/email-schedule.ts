import { loadConfiguration } from '../config/configuration.js';

/** Lightweight cron trigger; delivery runs in a separate background function. */
export default async function scheduledEmails(): Promise<Response> {
  const config = loadConfiguration();
  if (config.mail.dispatchSecret.length < 32) {
    throw new Error('Set EMAIL_DISPATCH_SECRET (32+ random characters) in Netlify Functions scope');
  }
  const response = await fetch(
    `${new URL(config.appBaseUrl).origin}/.netlify/functions/emails-background`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.mail.dispatchSecret}` },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (response.status !== 202)
    throw new Error(`Email dispatcher trigger returned ${response.status}`);
  return new Response(null, { status: 204 });
}
