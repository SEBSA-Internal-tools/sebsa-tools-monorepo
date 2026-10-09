/**
 * Shape returned by `ConfigService.get()`. `env.validation.ts` already
 * guaranteed these are present and well-formed by the time this runs, so
 * nothing here re-validates - it only reads.
 */
/** `TRUST_PROXY` as Express expects it: a hop count, an address list, or off. */
function trustProxy(raw: string | undefined): number | string | false {
  const value = raw?.trim() ?? '';
  if (value === '' || value.toLowerCase() === 'false') return false;
  return /^\d+$/.test(value) ? Number.parseInt(value, 10) : value;
}

export default () => ({
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
  port: Number.parseInt(process.env['PORT'] ?? '3000', 10),
  databaseUrl: process.env['DATABASE_URL'],
  frontendOrigins: (process.env['FRONTEND_ORIGIN'] ?? 'http://localhost:5175')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  trustProxy: trustProxy(process.env['TRUST_PROXY']),
  swaggerEnabled:
    process.env['SWAGGER_ENABLED'] === undefined
      ? (process.env['NODE_ENV'] ?? 'development') === 'development'
      : process.env['SWAGGER_ENABLED'] === 'true',
});
