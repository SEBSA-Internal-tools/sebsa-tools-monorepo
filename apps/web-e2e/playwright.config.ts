import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: './src',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? 'github' : [['list']],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: 'http://localhost:5175',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev -w @sdp/web',
    // Must run from the repo root: the dev command is a workspace script,
    // and Vite's own cwd-relative paths (public/, cacheDir key) depend on
    // resolving from apps/web, not from wherever Playwright was invoked.
    cwd: path.resolve(dirname, '../..'),
    url: 'http://localhost:5175',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
