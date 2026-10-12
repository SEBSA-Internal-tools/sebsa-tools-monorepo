// Generate a separate client: a running Windows dev API may lock .prisma/client.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(apiRoot, '../..');
const outputRoot = resolve(repoRoot, 'dist/netlify');
await mkdir(outputRoot, { recursive: true });
const source = await readFile(resolve(apiRoot, 'prisma/schema.prisma'), 'utf8');
const schema = source.replace(
  /generator client\s*\{[^}]*\}/,
  `generator client {
  provider = "prisma-client-js"
  output = "../../node_modules/@sdp/netlify-prisma"
  binaryTargets = ["rhel-openssl-3.0.x"]
}`,
);
if (schema === source) throw new Error('Prisma client generator block was not found');
const schemaPath = resolve(outputRoot, 'schema.prisma');
await writeFile(schemaPath, schema);

for (const args of [
  [require.resolve('prisma/build/index.js'), 'generate', '--schema', schemaPath],
  [resolve(apiRoot, 'esbuild.config.mjs'), '--netlify'],
]) {
  const child = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    // Client generation never connects to this database. Functions get their
    // real connection exclusively from Netlify's runtime environment.
    env: { ...process.env, DATABASE_URL: 'postgresql://build:build@localhost/build' },
  });
  if (child.error) throw child.error;
  if (child.status !== 0) process.exit(child.status ?? 1);
}
