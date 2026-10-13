import { loadConfiguration } from '../config/configuration.js';
import { EmailDispatcher } from '../modules/notifications/email-dispatcher.service.js';
import { getNetlifyApplication } from './application.js';
import { isAuthorisedDispatch } from './dispatch-auth.js';

export async function handler(event: Record<string, unknown>, context: Record<string, unknown>) {
  context['callbackWaitsForEmptyEventLoop'] = false;
  const headers = event['headers'] as Record<string, unknown> | undefined;
  const secret = loadConfiguration().mail.dispatchSecret;
  if (
    event['httpMethod'] !== 'POST' ||
    !isAuthorisedDispatch(headers?.['authorization'] ?? headers?.['Authorization'], secret)
  ) {
    return { statusCode: 403, body: 'Forbidden' };
  }
  const app = await getNetlifyApplication();
  // Bound each run to 40 messages. Unfinished work remains in the DB queue.
  await app.get(EmailDispatcher).runOnce(2);
  return { statusCode: 204, body: '' };
}
