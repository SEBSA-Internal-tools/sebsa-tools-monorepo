import serverless from 'serverless-http';
import { getNetlifyApplication } from './application.js';

let adapter: Promise<ReturnType<typeof serverless>> | undefined;

export async function handler(
  event: Record<string, unknown>,
  context: Record<string, unknown>,
): Promise<Record<string, unknown> & { headers: Record<string, string> }> {
  context['callbackWaitsForEmptyEventLoop'] = false;
  adapter ??= getNetlifyApplication()
    .then((app) => serverless(app.getHttpAdapter().getInstance(), { binary: false }))
    .catch((error: unknown) => {
      adapter = undefined;
      throw error;
    });
  // Netlify rewrites retain /api/foo in event.path. Support direct function
  // URLs too, while preserving Nest's global /api prefix and query parameters.
  const path = typeof event['path'] === 'string' ? event['path'] : '';
  const prefix = '/.netlify/functions/api';
  const routedEvent =
    path === prefix || path.startsWith(`${prefix}/`)
      ? { ...event, path: `/api${path.slice(prefix.length)}` }
      : event;
  const response = (await (await adapter)(routedEvent, context)) as Record<string, unknown>;
  const headers = response['headers'] as Record<string, string> | undefined;
  return {
    ...response,
    headers: {
      ...headers,
      'Cache-Control': 'private, no-store',
      'Netlify-CDN-Cache-Control': 'no-store',
    },
  };
}
