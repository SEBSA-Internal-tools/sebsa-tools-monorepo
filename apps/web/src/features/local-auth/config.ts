/**
 * Switches and addresses for the temporary local-auth feature.
 *
 * This whole folder exists only until sign-in moves to SSO. To remove it: delete
 * the folder, drop `localAuthRoutes` from `routes/index.tsx`, and revert the
 * three marked edits (Login link + banner, Users tab invite UI).
 */

/** Master switch. Off, no route is registered and no link to one is shown. */
export const isLocalAuthEnabled = import.meta.env['VITE_LOCAL_AUTH_ENABLED'] === 'true';

/** Fixed internal paths. Redirects only ever go to one of these. */
export const LOCAL_AUTH_ROUTES = {
  login: '/login',
  setPassword: '/set-password',
  forgotPassword: '/forgot-password',
  linkExpired: '/link-expired',
  signup: '/signup',
} as const;

/** Shown to the user; the backend owns the real values. */
export const INVITE_VALID_HOURS = 24;
export const RESET_VALID_MINUTES = 60;
export const RESEND_COOLDOWN_SECONDS = 60;
/** Where a successful password save sends the user, and how long it waits. */
export const SUCCESS_REDIRECT_MS = 3000;
