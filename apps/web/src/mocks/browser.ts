import { setupWorker } from 'msw/browser';
import { handlers } from './handlers.ts';
import { MOCK_DATABASE_KEY, persistDatabase, restoreDatabase } from './persistence.ts';

export const worker = setupWorker(...handlers);

/**
 * Starts the mock API.
 *
 * This is the ENTIRE Phase 1 mock surface as far as the application is
 * concerned. Deleting the call in `main.tsx` and this folder is the whole
 * migration to the real backend — no component, hook or query changes, because
 * everything above `apiClient` has been issuing real HTTP the whole time
 * (plan section 2.2).
 */
export async function startMockApi(): Promise<void> {
  restoreDatabase(localStorage);
  worker.events.on('response:mocked', ({ request, response }) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && response.ok) {
      persistDatabase(localStorage);
    }
  });
  window.addEventListener('storage', (event) => {
    if (event.key === MOCK_DATABASE_KEY) restoreDatabase(localStorage);
  });
  await worker.start({
    // A request the handlers do not cover is a gap we want to hear about, but
    // it must not break Vite's own asset and HMR traffic.
    onUnhandledRequest(request, print) {
      if (new URL(request.url).pathname.startsWith('/api')) {
        print.warning();
      }
    },
    quiet: false,
  });

  keepWorkerAttached();
}

/**
 * In-flight re-activation, shared by every caller.
 *
 * Without this, returning to a backgrounded tab fires `visibilitychange` and
 * `focus` together while several queries refetch at once — half a dozen
 * concurrent re-activations racing each other.
 */
let reactivation: Promise<void> | null = null;

/** Long enough for a worker the browser has to restart; short enough to not hang a request. */
const ACTIVATE_TIMEOUT_MS = 2_000;

/**
 * Re-attaches this page to the mock service worker, if it has come detached.
 *
 * THE FAILURE THIS FIXES
 * `mockServiceWorker.js` tracks its active clients in a plain `Set` in module
 * scope, and **bypasses every request to the real network when that set is
 * empty**:
 *
 * ```js
 * // Bypass all requests when there are no active clients.
 * if (activeClientIds.size === 0) return;
 * ```
 *
 * A client id is only added when the page sends `MOCK_ACTIVATE`, which happens
 * once, inside `worker.start()`. Browsers terminate an idle service worker after
 * roughly thirty seconds, and the 5s keepalive that would prevent it is a
 * `setInterval` the browser throttles in a backgrounded tab. So: leave the tab,
 * come back, and the restarted worker has no clients, passes `/api/*` through to
 * Vite, which 404s it as HTML.
 *
 * That is what the user sees as data vanishing — every mounted query fails at
 * once, because `refetchOnWindowFocus` fires them all the instant the tab is
 * focused. If `/auth/me` is among them the whole app is replaced by the "Lost
 * contact with the demo data" screen; if it is still fresh, only the grids
 * collapse into error cards.
 *
 * WHY THE TWO OBVIOUS FIXES DO NOT WORK
 *
 * 1. `controllerchange`, which this used to listen for, fires only when a
 *    DIFFERENT worker takes control. A worker the browser stopped and restarted
 *    is the same registration and the same `navigator.serviceWorker.controller`,
 *    so nothing is dispatched. The listener was right about what had to happen
 *    and wrong about when.
 *
 * 2. Calling `worker.start()` again does nothing at all. It is not idempotent in
 *    the useful direction — msw checks its own "already enabled" flag, which
 *    lives in the PAGE and is untouched by the worker being stopped, warns
 *    "Found a redundant worker.start() call", and returns before reaching the
 *    `MOCK_ACTIVATE` post. Verified by reading `msw/lib/browser/index.js`, and
 *    then by probing a real browser: with a `worker.start()`-based recovery in
 *    place, `/api/auth/me` still answered `404 text/html` after the worker was
 *    stopped.
 *
 * So the message is sent directly. `MOCK_ACTIVATE` and its `MOCKING_ENABLED`
 * reply are the worker's own protocol, defined in the vendored
 * `public/mockServiceWorker.js` in this repository — a checked-in file with a
 * version and an integrity checksum, not a private API that can drift under us,
 * and one that Phase 2 deletes along with the rest of `src/mocks/`.
 *
 * Resolving on the reply rather than immediately is what makes the retry in
 * `apiClient` correct: re-sending the request before the worker has re-added
 * this client would be bypassed exactly like the first one.
 */
export function ensureMockApiActive(): Promise<void> {
  if (!('serviceWorker' in navigator)) return Promise.resolve();

  reactivation ??= reactivate().finally(() => {
    reactivation = null;
  });

  return reactivation;
}

async function reactivate(): Promise<void> {
  // Restarts the worker if the browser has stopped it, and guarantees a
  // controller to post to.
  await navigator.serviceWorker.ready;

  const controller = navigator.serviceWorker.controller;
  if (controller === null) return;

  await new Promise<void>((resolve) => {
    const done = () => {
      window.clearTimeout(timer);
      navigator.serviceWorker.removeEventListener('message', onMessage);
      resolve();
    };

    const onMessage = (event: MessageEvent<unknown>) => {
      const type = (event.data as { type?: unknown } | null)?.type;
      if (type === 'MOCKING_ENABLED') done();
    };

    /*
     * Resolve on the timeout too, never reject.
     *
     * This runs on the request path. If re-activation cannot be confirmed the
     * caller should still get its answer — a real error it can report — rather
     * than an unhandled rejection from the recovery attempt itself.
     */
    const timer = window.setTimeout(done, ACTIVATE_TIMEOUT_MS);

    navigator.serviceWorker.addEventListener('message', onMessage);
    controller.postMessage('MOCK_ACTIVATE');
  });
}

/**
 * Re-activates the worker at every moment it might have been stopped.
 *
 * Three signals, because no single one covers the ground:
 *
 * - `visibilitychange` is the common case: the tab was backgrounded long enough
 *   for the browser to reclaim the worker.
 * - `focus` covers returning to the window without the tab ever being hidden —
 *   another application on top of the browser, which does not always flip
 *   `visibilityState`.
 * - `controllerchange` still covers an actual worker replacement, which is what
 *   happens after `mockServiceWorker.js` itself is updated.
 *
 * All three are cheap: a page that never detached re-sends one postMessage.
 *
 * The last line of defence is in `apiClient`, which calls `ensureMockApiActive()`
 * and retries once when a reply comes back looking like Vite's HTML 404 — so
 * even a detach that happens mid-session, between these events, recovers without
 * the user seeing anything.
 */
function keepWorkerAttached(): void {
  if (!('serviceWorker' in navigator)) return;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void ensureMockApiActive();
  });

  window.addEventListener('focus', () => {
    void ensureMockApiActive();
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    void ensureMockApiActive();
  });
}
