import { spawnSync } from 'node:child_process';

// Explicitly select production even when a site has old development settings
// or its secret environment values are masked by the local Netlify CLI.
for (const workspace of ['@sdp/api', '@sdp/web']) {
  const target = workspace === '@sdp/api' ? 'build:netlify' : 'build';
  const result = spawnSync(
    process.execPath,
    [process.env.npm_execpath, 'run', target, '--workspace', workspace],
    {
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'production', VITE_MAX_API_REQUEST_BYTES: '4500000' },
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
