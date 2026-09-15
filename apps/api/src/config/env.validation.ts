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
});

export type Env = z.infer<typeof envSchema>;

export function validate(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration:\n${parsed.error.message}`);
  }
  return parsed.data;
}
