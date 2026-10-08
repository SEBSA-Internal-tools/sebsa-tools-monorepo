/**
 * Timings for the temporary local-auth feature.
 *
 * This whole folder exists only until sign-in moves to SSO. To remove it: delete
 * the folder, drop the set-password / forgot-password / link-expired children of
 * the guest route in `routes/index.tsx` (and their `routePaths` entries), the
 * "Forgot password?" link in `LoginRoute`, the invite column and actions on the
 * Users tab, and `mocks/passwordLinks.ts`.
 *
 * Addresses live in `constants/routePaths.ts` with every other route.
 */

/** Shown to the user; the backend owns the real values. */
export const INVITE_VALID_HOURS = 24;
export const RESET_VALID_MINUTES = 60;
export const RESEND_COOLDOWN_SECONDS = 60;
/** Where a successful password save sends the user, and how long it waits. */
export const SUCCESS_REDIRECT_MS = 3000;
