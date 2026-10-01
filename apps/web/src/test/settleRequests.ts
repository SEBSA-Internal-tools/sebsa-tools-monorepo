import { expect } from 'vitest';
import { cleanup, waitFor } from '@testing-library/react';
import { server } from './mswServer.ts';

// Writes only: they are what can leak state, and unlike queries they are never
// aborted on unmount, so every start is matched by an end.
const pendingWrites = new Set<string>();
server.events.on('request:start', ({ request, requestId }) => {
  if (request.method !== 'GET') pendingWrites.add(requestId);
});
server.events.on('request:end', ({ requestId }) => {
  pendingWrites.delete(requestId);
});

/**
 * Unmounts, then waits for every write the test left in flight.
 *
 * For suites that drive the autosaving review page: a debounced save that lands
 * after the shared `resetDb()` would seed the NEXT test with this one's comments.
 * Unmounting first cancels any save that has not started yet.
 */
export async function settleRequests(): Promise<void> {
  cleanup();
  await waitFor(() => {
    expect(pendingWrites.size).toBe(0);
  });
}
