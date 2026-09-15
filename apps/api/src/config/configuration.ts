/**
 * Shape returned by `ConfigService.get()`. `env.validation.ts` already
 * guaranteed these are present and well-formed by the time this runs, so
 * nothing here re-validates - it only reads.
 */
export default () => ({
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
  port: Number.parseInt(process.env['PORT'] ?? '3000', 10),
  databaseUrl: process.env['DATABASE_URL'],
  frontendOrigins: (process.env['FRONTEND_ORIGIN'] ?? 'http://localhost:5175')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
});
