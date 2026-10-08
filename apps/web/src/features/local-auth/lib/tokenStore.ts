/**
 * Holds the one-time link token, in memory only.
 *
 * The token arrives in the URL fragment (`#token=...`) so it is never sent to a
 * server or written to an access log. It is read once, scrubbed from the address
 * bar at once, and kept here — a module variable, never localStorage,
 * sessionStorage, a cookie, a log line or another URL.
 *
 * A module variable rather than component state so React StrictMode's second
 * effect run, which sees the already-scrubbed URL, still finds the token.
 */

let current: string | null = null;

export function getToken(): string | null {
  return current;
}

export function setToken(token: string | null): void {
  current = token;
}

export function clearToken(): void {
  current = null;
}

/** Pulls `token` out of a location hash such as `#token=abc`. */
export function parseTokenFromHash(hash: string): string | null {
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const token = params.get('token');
  return token !== null && token !== '' ? token : null;
}

/**
 * Takes the token from the address bar into memory and removes it from the URL.
 *
 * `replaceState` keeps the router's own history entry (`window.history.state`)
 * so React Router is not confused, and drops only the fragment. Returns the token
 * now held, or null if there never was one.
 */
export function captureTokenFromLocation(): string | null {
  const fromHash = parseTokenFromHash(window.location.hash);
  if (fromHash !== null) {
    current = fromHash;
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${window.location.search}`,
    );
  }
  return current;
}

/**
 * Router state survives in the browser's session history — and so across a
 * reload — which would defeat "memory only". Moves a token out of the current
 * history entry's state into the store and rewrites the entry without it.
 */
export function adoptTokenFromHistoryState(token: string | undefined): string | null {
  if (token !== undefined && token !== '') current = token;

  const state = window.history.state as { usr?: Record<string, unknown> } | null;
  if (state?.usr && 'token' in state.usr) {
    const { token: _removed, ...rest } = state.usr;
    window.history.replaceState({ ...state, usr: rest }, '');
  }
  return current;
}
