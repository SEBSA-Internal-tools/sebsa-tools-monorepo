import { setupServer } from 'msw/node';
import { handlers } from '@/mocks/handlers.ts';

/**
 * Node-side MSW server for tests.
 *
 * Deliberately reuses the SAME handlers the browser uses. Tests therefore
 * exercise the real request path — fetch, status codes, Zod response parsing in
 * `apiClient` — instead of a stubbed function that would pass even if the
 * contract were wrong.
 */
export const server = setupServer(...handlers);
