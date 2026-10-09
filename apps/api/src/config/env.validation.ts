import { z } from 'zod';

/**
 * Validated once at boot, via `ConfigModule.forRoot({ validate })`. A
 * missing or malformed `DATABASE_URL` fails startup immediately with a
 * readable error instead of surfacing as a connection failure the first
 * time a request needs the database.
 */
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.url(),
    FRONTEND_ORIGIN: z.string().default('http://localhost:5175'),
    JWT_ACCESS_SECRET: z.string().min(32).optional(),
    JWT_REFRESH_SECRET: z.string().min(32).optional(),
    JWT_ISSUER: z.string().min(1).default('sebsa-code-review-api'),
    JWT_AUDIENCE: z.string().min(1).default('sebsa-code-review-web'),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
    JWT_REMEMBER_TTL_SECONDS: z.coerce.number().int().positive().default(2592000),
    // Unset means "Secure in production, not in development" (auth.config.ts).
    COOKIE_SECURE: z.enum(['true', 'false']).optional(),
    // Express `trust proxy`: a hop count ("1") or a list of trusted proxy
    // addresses/subnets ("loopback, 10.0.0.0/8"). Never "true": that trusts any
    // client-supplied X-Forwarded-For and defeats per-IP rate limiting.
    TRUST_PROXY: z
      .string()
      .trim()
      .refine(
        (value) => value.toLowerCase() !== 'true',
        'Use a hop count or proxy addresses, not "true"',
      )
      .optional(),
    SWAGGER_ENABLED: z.enum(['true', 'false']).optional(),
    BOOTSTRAP_ADMIN_EMAIL: z.string().optional(),
    BOOTSTRAP_ADMIN_PASSWORD: z.string().optional(),
    BOOTSTRAP_ADMIN_NAME: z.string().optional(),
  })
  .superRefine((env, context) => {
    if (env.NODE_ENV === 'test') return;
    for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
      if (!env[key]) {
        context.addIssue({ code: 'custom', path: [key], message: `${key} is required` });
      }
    }
    if (env.NODE_ENV === 'production') assertProductionTransport(env, context);
  });

/**
 * Production must run over HTTPS end to end. The session cookies are `Secure`
 * there, so a plain-HTTP deployment would not fail loudly — browsers would just
 * never send the cookies back and every login would bounce. Fail at boot instead.
 */
function assertProductionTransport(
  env: { COOKIE_SECURE?: string | undefined; FRONTEND_ORIGIN: string; DATABASE_URL: string },
  context: z.RefinementCtx,
): void {
  if (env.COOKIE_SECURE === 'false') {
    context.addIssue({
      code: 'custom',
      path: ['COOKIE_SECURE'],
      message: 'COOKIE_SECURE cannot be false in production; serve the app over HTTPS',
    });
  }
  const origins = env.FRONTEND_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (origins.length === 0 || origins.some((origin) => !origin.startsWith('https://'))) {
    context.addIssue({
      code: 'custom',
      path: ['FRONTEND_ORIGIN'],
      message: 'Every FRONTEND_ORIGIN must be an https:// origin in production',
    });
  }
  const sslMode = new URL(env.DATABASE_URL).searchParams.get('sslmode');
  if (sslMode !== 'require' && sslMode !== 'verify-full' && sslMode !== 'verify-ca') {
    context.addIssue({
      code: 'custom',
      path: ['DATABASE_URL'],
      message: 'DATABASE_URL must use sslmode=require (or verify-full) in production',
    });
  }
}

export type Env = z.infer<typeof envSchema>;

export function validate(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration:\n${parsed.error.message}`);
  }
  return parsed.data;
}
