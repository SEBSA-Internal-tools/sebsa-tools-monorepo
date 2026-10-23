import { z } from 'zod';

const emptyToUndefined = (val: unknown) => (val === '' ? undefined : val);

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  SUPABASE_SERVICE_ROLE_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  AI_PROVIDER: z.preprocess(emptyToUndefined, z.enum(['gemini', 'claude']).default('gemini')),
  GEMINI_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  CLAUDE_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  // Absolute origin used to build the invite-email redirect link (app/(authenticated)/upload/actions.ts
  // -> lib/auth/provisionAccount.ts) since Server Actions have no reliable window.location. Must
  // also be added to Supabase Dashboard -> Authentication -> URL Configuration -> Redirect URLs
  // as `${NEXT_PUBLIC_APP_URL}/auth/callback`, or Supabase will reject the invite redirect.
  NEXT_PUBLIC_APP_URL: z.preprocess(emptyToUndefined, z.string().url().default('http://localhost:3000')),
  // Transactional notification emails (lib/email/*) — sent via Brevo's SMTP relay (not its REST
  // API — BREVO_SMTP_KEY is the SMTP key from Brevo dashboard -> SMTP & API -> SMTP tab, which
  // starts with `xsmtpsib-`; that's a different credential from the REST `xkeysib-` API key).
  // BREVO_SMTP_LOGIN is the "Login" value shown on that same SMTP tab (looks like
  // <id>@smtp-brevo.com) — it authenticates the connection but is NOT the visible From address,
  // which is EMAIL_FROM_ADDRESS below and must separately be a verified sender in the Brevo
  // dashboard (Senders, Domains & Dedicated IPs -> Senders) — Brevo supports verifying just a
  // single sender email address, no DNS/domain ownership required.
  BREVO_SMTP_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  BREVO_SMTP_LOGIN: z.preprocess(emptyToUndefined, z.string().optional()),
  EMAIL_FROM_ADDRESS: z.preprocess(emptyToUndefined, z.string().optional()),
  EMAIL_FROM_NAME: z.preprocess(emptyToUndefined, z.string().default('SEBSA Employee Management Portal')),
});

/**
 * Parsed once at import time. Individual fields may legitimately be undefined this early in the
 * migration (e.g. no Supabase project yet) — callers that actually need a value must go through
 * `requireEnv` so the failure surfaces at the point of use, not on every page load.
 */
export const env = envSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  AI_PROVIDER: process.env.AI_PROVIDER,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  CLAUDE_API_KEY: process.env.CLAUDE_API_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  BREVO_SMTP_KEY: process.env.BREVO_SMTP_KEY,
  BREVO_SMTP_LOGIN: process.env.BREVO_SMTP_LOGIN,
  EMAIL_FROM_ADDRESS: process.env.EMAIL_FROM_ADDRESS,
  EMAIL_FROM_NAME: process.env.EMAIL_FROM_NAME,
});

export function requireEnv<K extends keyof typeof env>(key: K): NonNullable<(typeof env)[K]> {
  const value = env[key];
  if (value === undefined || value === '') {
    throw new Error(
      `Missing required environment variable: ${key}. Set it in .env.dev (see .env.local.example).`
    );
  }
  return value as NonNullable<(typeof env)[K]>;
}
