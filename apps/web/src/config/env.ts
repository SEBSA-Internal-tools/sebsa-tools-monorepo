/**
 * Environment access, resolved once.
 *
 * Reading `import.meta.env` directly from components would scatter defaults.
 * Authentication deliberately has no mock-mode setting: browser builds always
 * use the real NestJS API through `/api`.
 *
 * Every value here is set in apps/web/.env (see .env.example) and read only
 * through `appEnv`; the fallback beside each is the single default.
 */
function setting(value: string | undefined, fallback: string): string {
  return value?.trim() ? value.trim() : fallback;
}

export const appEnv = {
  /** VITE_EMAIL_PLACEHOLDER — example address in the sign-in and forgot-password fields. */
  emailPlaceholder: setting(import.meta.env.VITE_EMAIL_PLACEHOLDER, 'you@sebsaworld.com'),
} as const;
