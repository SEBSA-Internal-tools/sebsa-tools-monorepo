import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vitest/config";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
import viteConfig from "./vite.config.ts";

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Two test projects with very different costs:
 *
 *   unit      — jsdom, no browser, runs on every commit and in the fast CI job.
 *   storybook — real Chromium via Playwright, renders every story and runs the
 *               a11y checks. Slower, so it lives in its own CI job.
 *
 * `mergeConfig` is required: the presence of this file stops Vitest reading
 * `vite.config.ts`, so the React/Tailwind plugins and the `@/` + `@sdp/*`
 * aliases have to be inherited explicitly.
 */
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      projects: [
        {
          extends: true,
          test: {
            name: "unit",
            environment: "jsdom",
            globals: false,
            css: true,
            setupFiles: ["./src/test/setup.ts"],
            include: ["src/**/*.{test,spec}.{ts,tsx}", "packages/*/src/**/*.{test,spec}.{ts,tsx}"],
            exclude: ["**/node_modules/**", "e2e/**"],
          },
        },
        {
          extends: true,
          plugins: [storybookTest({ configDir: path.join(dirname, ".storybook") })],
          test: {
            name: "storybook",
            browser: {
              enabled: true,
              headless: true,
              provider: playwright({}),
              instances: [{ browser: "chromium" }],
            },
          },
        },
      ],
      coverage: {
        provider: "v8",
        reporter: ["text", "html", "lcov"],
        include: ["src/**/*.{ts,tsx}", "packages/*/src/**/*.ts"],
        exclude: ["**/*.stories.tsx", "**/*.d.ts", "src/mocks/**", "src/test/**", "**/index.ts"],
        thresholds: {
          // Business rules must be provably covered. UI is covered by stories
          // and e2e, so a global threshold here would only invite noise.
          "**/domain/**": {
            statements: 90,
            branches: 85,
            functions: 90,
            lines: 90,
          },
        },
      },
    },
  }),
);
