import { z } from 'zod';

/**
 * Validated once at boot, via `ConfigModule.forRoot({ validate })`. A
 * missing or malformed `DATABASE_URL` fails startup immediately with a
 * readable error instead of surfacing as a connection failure the first
 * time a request needs the database.
 */
const envSchema = z.object({
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
  COOKIE_SECURE: z.enum(['true', 'false']).default('false'),
  BOOTSTRAP_ADMIN_EMAIL: z.string().optional(),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().optional(),
  BOOTSTRAP_ADMIN_NAME: z.string().optional(),
}).superRefine((env, context) => {
  if (env.NODE_ENV === 'test') return;
  for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
    if (!env[key]) {
      context.addIssue({ code: 'custom', path: [key], message: `${key} is required` });
    }
  }
});

export type Env = z.infer<typeof envSchema>;

export function validate(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration:\n${parsed.error.message}`);
  }
  return parsed.data;
}
