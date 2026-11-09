/**
 * One-off live check of the Microsoft Graph mail setup. Sends ONE clearly-labelled test message.
 *
 *   npx --yes dotenv-cli -e .env.mail-test -- npx --yes tsx --tsconfig tsconfig.json \
 *     scripts/send-test-mail.ts colleague@sebsaworld.com [--dry-run]
 *
 * Safety: exactly one recipient, restricted to the company domain unless --allow-external is given,
 * and --dry-run prints what would be sent without contacting Microsoft. Only the outcome is printed;
 * the client secret is never shown. Get the recipient's consent before sending to a real person.
 */
import { createGraphMailer } from '@/lib/email/graphMail';

const ALLOWED_DOMAIN = '@sebsaworld.com';

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const allowExternal = args.includes('--allow-external');
  const recipients = args.filter((a) => !a.startsWith('--'));

  if (recipients.length !== 1) {
    console.error('Usage: send-test-mail.ts <one recipient address> [--dry-run] [--allow-external]');
    process.exit(2);
  }
  const to = recipients[0].trim();
  if (!allowExternal && !to.toLowerCase().endsWith(ALLOWED_DOMAIN)) {
    console.error(`Refusing to send to ${to}: only ${ALLOWED_DOMAIN} addresses are allowed (use --allow-external to override).`);
    process.exit(2);
  }

  const config = {
    tenantId: process.env.GRAPH_TENANT_ID ?? '',
    clientId: process.env.GRAPH_CLIENT_ID ?? '',
    clientSecret: process.env.GRAPH_CLIENT_SECRET ?? '',
    sender: process.env.GRAPH_SENDER ?? '',
  };
  const missing = Object.entries(config).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    console.error(`Missing settings in the env file: ${missing.join(', ')}`);
    process.exit(2);
  }

  const sentAt = new Date().toISOString();
  const email = {
    subject: 'SEBSA portal: mail setup test',
    html:
      '<div style="font-family:Segoe UI,Arial,sans-serif;max-width:480px">' +
      '<h2 style="margin:0 0 12px">Mail setup test</h2>' +
      '<p>This message was sent through Microsoft Graph by the SEBSA Employee Management Portal to confirm ' +
      `the shared mailbox is working. No action is needed.</p><p style="color:#888;font-size:12px">Sent ${sentAt}</p></div>`,
  };

  console.log(`sender   : ${config.sender}`);
  console.log(`recipient: ${to}`);
  console.log(`tenant   : ${config.tenantId}`);
  console.log(`app (client) id: ${config.clientId}`);
  if (dryRun) {
    console.log('\n--dry-run: nothing was sent. Subject would be:', JSON.stringify(email.subject));
    return;
  }

  const result = await createGraphMailer(config).send(to, email);
  console.log('\nresult:', JSON.stringify({ ...result, message: result.message ?? undefined }, null, 2));
  if (result.ok) {
    console.log(`\nSent (HTTP ${result.status}). Check the recipient's inbox and the shared mailbox's Sent Items.`);
  } else {
    console.error('\nNOT sent. See docs/graph-mail.md, "Troubleshooting", for this error code.');
    // exitCode (not process.exit) lets Node close the network connection first; exiting while it is
    // still closing makes Node on Windows print a harmless but alarming libuv assertion.
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
