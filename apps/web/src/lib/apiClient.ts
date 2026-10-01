import type { z } from 'zod';
import { apiErrorSchema } from '@sdp/contracts';

/**
 * The single HTTP seam between the application and its data.
 *
 * This layer issues real `fetch` calls to relative URLs. Development can use
 * MSW or the Vite proxy; production sends the same requests to NestJS.
 *
 * Responses are parsed through the Zod schema the caller supplies. That costs
 * microseconds against a network round-trip and buys the thing most likely to
 * bite us: a backend that quietly returns a differently-shaped payload than the
 * mocks did. Better a loud error here than `undefined` surfacing three
 * components away.
 */

const API_BASE = '/api';
const USE_MOCK_API = import.meta.env.DEV && import.meta.env['VITE_USE_MOCK_API'] !== 'false';
export const isMockApiEnabled = USE_MOCK_API;
export const MOCK_IDENTITY_KEY = 'sdp.mock-user-id';

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly fieldErrors: Record<string, string[]> | undefined;
  readonly correlationId: string | undefined;

  constructor(init: {
    statusCode: number;
    code: string;
    message: string;
    fieldErrors?: Record<string, string[]> | undefined;
    correlationId?: string | undefined;
  }) {
    super(init.message);
    this.name = 'ApiError';
    this.statusCode = init.statusCode;
    this.code = init.code;
    this.fieldErrors = init.fieldErrors;
    this.correlationId = init.correlationId;
  }

  /** 4xx responses are the user's problem to fix; retrying will not help. */
  get isClientError(): boolean {
    return this.statusCode >= 400 && this.statusCode < 500;
  }
}

/**
 * Thrown when a response parses as JSON but does not match the expected schema.
 * Distinct from ApiError because the cause is a broken contract, not a failed
 * request — it should reach an engineer, not be shown to a user as-is.
 */
export class ApiContractError extends Error {
  readonly issues: z.ZodError['issues'];

  constructor(path: string, issues: z.ZodError['issues']) {
    super(`Response from ${path} did not match its schema`);
    this.name = 'ApiContractError';
    this.issues = issues;
  }
}

/**
 * Development mocks only. Identifies the caller to MSW so handlers can filter
 * server-side (for example
 * excluding a reviewer's own submissions from the Available queue) instead of
 * the UI hiding rows it should never have received.
 *
 * The identity is **read from storage on every request** rather than cached in
 * this module. It used to be a module-level `let` primed once at boot, and that
 * was a real bug: Vite HMR re-evaluates the module and resets it to `null` while
 * React state survives, so every subsequent request went out unauthenticated
 * while the UI still believed it was signed in — surfacing as an authentication
 * error minutes after launch.
 *
 * `setMockUserId` is an explicit override used by the unit-test harness. Real
 * authentication never reads this value and relies only on HttpOnly cookies.
 */
let identityOverride: string | null = null;

export function setMockUserId(userId: string | null): void {
  identityOverride = userId;
}

function callerIdentity(): string | null {
  if (identityOverride !== null) return identityOverride;
  if (!USE_MOCK_API || typeof window === 'undefined') return null;
  return window.sessionStorage.getItem(MOCK_IDENTITY_KEY) ?? window.localStorage.getItem(MOCK_IDENTITY_KEY);
}

/**
 * Raised when a request to `/api/*` came back as something the mock API would
 * never produce — which in Phase 1 means the MSW service worker has stopped
 * intercepting and the request fell through to the Vite dev server.
 *
 * This deserves its own type because it is NOT an authentication failure, and
 * treating it as one is what produced the misleading "Authentication failed or
 * user account not configured" screen. It is also not retryable: the next
 * request is bypassed too, so only a reload can recover.
 */
export class MockApiDetachedError extends Error {
  constructor(path: string) {
    super(
      `The demo API is no longer intercepting requests (${path}). ` +
        'This happens when the mock service worker is stopped by the browser.',
    );
    this.name = 'MockApiDetachedError';
  }
}

/**
 * Phase 1 only. How this layer puts a detached mock API back together.
 *
 * Registered by `main.tsx` from inside its existing `import.meta.env.DEV` block,
 * so this module keeps knowing nothing about `src/mocks/` and deleting that
 * folder in Phase 2 stays a one-line change. Unset in production, where the hook
 * is never even reached — `isMockDetached` returns `false` outside DEV.
 *
 * Inverted rather than imported for the same reason the identity override is:
 * `lib/` may not depend on a folder that is about to be deleted.
 */
let detachedRecovery: (() => Promise<void>) | null = null;

export function setDetachedRecovery(recover: (() => Promise<void>) | null): void {
  detachedRecovery = recover;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  searchParams?: Record<string, string | number | boolean | undefined | null>;
}

function buildUrl(path: string, searchParams?: RequestOptions['searchParams']): string {
  const url = `${API_BASE}${path}`;
  if (!searchParams) return url;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value !== undefined && value !== null && value !== '') {
      params.append(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function toApiError(response: Response, path: string): Promise<ApiError> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const parsed = apiErrorSchema.safeParse(payload);
  if (parsed.success) {
    return new ApiError(parsed.data);
  }

  // The server failed in a way it did not describe (proxy error, 502, HTML page).
  return new ApiError({
    statusCode: response.status,
    code: 'UNKNOWN',
    message: `Request to ${path} failed with status ${response.status}`,
  });
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const { method = 'GET', body, signal, searchParams } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (!['GET'].includes(method)) {
    const csrf = readCookie('sdp_csrf');
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }

  const identity = USE_MOCK_API ? callerIdentity() : null;
  if (identity) headers['X-Mock-User-Id'] = identity;

  try {
    return await fetch(buildUrl(path, searchParams), {
      method,
      headers,
      credentials: 'include',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(signal ? { signal } : {}),
    });
  } catch (cause) {
    // fetch only rejects on a genuine transport failure, never on 4xx/5xx.
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiError({
      statusCode: 0,
      code: 'NETWORK',
      message: 'Could not reach the server. Check your connection and try again.',
    });
  }
}

async function request<TSchema extends z.ZodTypeAny>(
  path: string,
  schema: TSchema,
  options: RequestOptions = {},
): Promise<z.infer<TSchema>> {
  let response = await send(path, options);

  if (response.status === 401 && shouldRefresh(path)) {
    if (!USE_MOCK_API && (await refreshAuthentication())) response = await send(path, options);
    if (response.status === 401) window.dispatchEvent(new Event('sdp:unauthorized'));
  }

  /*
   * Phase 1 only. When the browser stops the MSW service worker, it bypasses
   * requests to the real network; the reply is an HTML 404, or a plain-text 502
   * from the dev proxy when no backend is running. That is indistinguishable
   * from a genuine error by status alone, so the content type is what tells
   * them apart — the mock API always answers JSON, including for its errors.
   *
   * Recover in place rather than surfacing the failure. Re-attaching the worker
   * takes a postMessage round trip, and the request that noticed the problem is
   * the one best placed to pay for it — the alternative is an error screen for
   * something the app can fix by itself. See `mocks/browser.ts`.
   *
   * Exactly once: if the retry is bypassed too, the worker is genuinely gone and
   * only a reload will help, which is what `RootLayout` then offers.
   */
  if (!response.ok && isMockDetached(response) && detachedRecovery !== null) {
    await detachedRecovery();
    response = await send(path, options);
  }

  if (!response.ok) {
    if (isMockDetached(response)) throw new MockApiDetachedError(path);
    throw await toApiError(response, path);
  }

  if (response.status === 204) {
    return schema.parse(undefined);
  }

  const json: unknown = await response.json();
  const result = schema.safeParse(json);
  if (!result.success) {
    throw new ApiContractError(path, result.error.issues);
  }
  return result.data;
}

function shouldRefresh(path: string): boolean {
  return !['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'].includes(path);
}

let refreshInFlight: Promise<boolean> | null = null;

function refreshAuthentication(): Promise<boolean> {
  const csrf = readCookie('sdp_csrf');
  refreshInFlight ??= fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { Accept: 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
    credentials: 'include',
  })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const prefix = `${name}=`;
  const pair = document.cookie.split('; ').find((entry) => entry.startsWith(prefix));
  return pair ? decodeURIComponent(pair.slice(prefix.length)) : undefined;
}

/**
 * True when a failed `/api/*` response did not come from the mock API.
 *
 * Guarded on `import.meta.env.DEV` because the whole failure mode is a Phase 1
 * artefact: in production there is no service worker to detach, and a real 404
 * from NestJS must stay a plain 404.
 */
function isMockDetached(response: Response): boolean {
  if (!import.meta.env.DEV) return false;
  // 502: the dev server's `/api` proxy (vite.config.ts) when no backend is listening.
  if (response.status !== 404 && response.status !== 502) return false;

  const contentType = response.headers.get('content-type') ?? '';
  return !contentType.includes('json');
}

/**
 * Wraps a schema so a 204 becomes `null` rather than `undefined`.
 *
 * Several endpoints answer 204 for "this exists but has nothing yet" — a task
 * with no checklist, a review not started. `schema.nullish()` alone parses the
 * 204's `undefined` straight through, and TanStack Query REJECTS `undefined` as
 * query data: the query lands in an error state and the screen renders its empty
 * branch, which looks exactly like the correct result. That is how this went
 * unnoticed until a browser console showed "Query data cannot be undefined".
 *
 * Use this for any endpoint that can answer 204 with a body-shaped absence.
 */
export function absentAsNull<TOutput>(schema: z.ZodType<TOutput>): z.ZodType<TOutput | null> {
  return schema.nullish().transform((value) => value ?? null);
}

export const api = {
  get: <TSchema extends z.ZodTypeAny>(
    path: string,
    schema: TSchema,
    options?: Omit<RequestOptions, 'method' | 'body'>,
  ) => request(path, schema, { ...options, method: 'GET' }),

  post: <TSchema extends z.ZodTypeAny>(
    path: string,
    schema: TSchema,
    body?: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>,
  ) => request(path, schema, { ...options, method: 'POST', body }),

  patch: <TSchema extends z.ZodTypeAny>(
    path: string,
    schema: TSchema,
    body?: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>,
  ) => request(path, schema, { ...options, method: 'PATCH', body }),

  /**
   * PUT, for resources the client replaces wholesale — the task checklist is
   * saved as one document rather than patched question by question, so a partial
   * save cannot leave answers from a task type the developer has deselected.
   */
  put: <TSchema extends z.ZodTypeAny>(
    path: string,
    schema: TSchema,
    body?: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>,
  ) => request(path, schema, { ...options, method: 'PUT', body }),

  delete: <TSchema extends z.ZodTypeAny>(
    path: string,
    schema: TSchema,
    options?: Omit<RequestOptions, 'method'>,
  ) => request(path, schema, { ...options, method: 'DELETE' }),
};
