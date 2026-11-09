const OPAQUE_AUTH_MESSAGES = new Set(['{}', '[object Object]']);

/**
 * Supabase Auth occasionally returns an empty JSON response body as the error message. Never
 * expose that provider detail in the UI; use a useful, flow-specific fallback instead.
 */
export function readableAuthError(error: unknown, fallback: string): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String(error.message)
        : typeof error === 'string'
          ? error
          : '';
  const normalized = message.trim();

  return normalized && !OPAQUE_AUTH_MESSAGES.has(normalized) ? normalized : fallback;
}
