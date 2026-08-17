import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";


const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Application build config. Test configuration deliberately lives in
 * `vitest.config.ts`, which merges this file — keeping the two apart means a
 * browser-mode Storybook run cannot break `npm run build`.
 *
 * The `@sdp/*` aliases point at TypeScript source rather than relying solely on
 * the npm workspace symlinks. Without them Vite's dependency optimiser tries to
 * pre-bundle the workspace packages and fails to resolve an entry, since they
 * publish `.ts` rather than built output.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(dirname, "src"),
      "@sdp/contracts": path.resolve(dirname, "packages/contracts/src"),
      "@sdp/types": path.resolve(dirname, "packages/types/src"),
    },
  },
  server: {
    port: 5175,
  },
  build: {
    sourcemap: true,
  },
});

