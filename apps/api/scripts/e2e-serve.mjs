// @ts-check
/**
 * Starts the built API for the Playwright suite, against the e2e database only.
 *
 *   node scripts/e2e-serve.mjs        (Playwright's webServer runs this)
 *
 * - DATABASE_URL is REPLACED by E2E_DATABASE_URL (default: the private cluster
 *   from `e2e-db.mjs`) after the same local-and-"e2e" guard, so the shared Neon
 *   database in apps/api/.env can never be reached.
 * - Port 3100 (E2E_API_PORT), never 3000: a developer's own `npm run dev` API
 *   (pointed at Neon) must not be mistaken for the test server.
 * - E2E_MAIL_OUTBOX records invite/reset links for the tests to open.
 * - Every start recreates the e2e database (`e2e-db.mjs up` + `reset`) unless
 *   E2E_SKIP_DB_RESET=1, so each Playwright run begins from the same seed.
 */
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertDisposableDatabase, DEFAULT_E2E_DATABASE_URL } from './e2e-db.mjs';

const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const databaseUrl = process.env['E2E_DATABASE_URL'] ?? DEFAULT_E2E_DATABASE_URL;
assertDisposableDatabase(databaseUrl);

if (process.env['E2E_SKIP_DB_RESET'] !== '1') {
  const db = path.join(apiDir, 'scripts', 'e2e-db.mjs');
  const env = { ...process.env, E2E_DATABASE_URL: databaseUrl };
  execFileSync(process.execPath, [db, 'up'], { cwd: apiDir, stdio: 'inherit', env });
  execFileSync(process.execPath, [db, 'reset'], { cwd: apiDir, stdio: 'inherit', env });
}

const outbox =
  process.env['E2E_MAIL_OUTBOX'] ??
  path.resolve(apiDir, '../web-e2e/test-results/mail-outbox.jsonl');
mkdirSync(path.dirname(outbox), { recursive: true });
writeFileSync(outbox, '');

execFileSync(process.execPath, ['esbuild.config.mjs'], { cwd: apiDir, stdio: 'inherit' });

const port = process.env['E2E_API_PORT'] ?? '3100';
const webOrigin = process.env['E2E_WEB_ORIGIN'] ?? 'http://localhost:5185';
const child = spawn(process.execPath, [path.resolve(apiDir, '../../dist/apps/api/main.js')], {
  cwd: apiDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'test',
    PORT: port,
    DATABASE_URL: databaseUrl,
    FRONTEND_ORIGIN: webOrigin,
    SWAGGER_ENABLED: 'false',
    E2E_MAIL_OUTBOX: outbox,
  },
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.on('exit', (code) => process.exit(code ?? 0));
