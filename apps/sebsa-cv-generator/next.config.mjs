import fs from 'node:fs';
import path from 'node:path';

// Next.js does not load the project-specific `.env.dev` filename by default.
// Load it before the application is compiled so server and client code can use
// the project-specific development environment. It intentionally wins over
// Next.js's automatically loaded `.env.development.local` for this project.
const devEnvPath = path.join(process.cwd(), '.env.dev');
if (fs.existsSync(devEnvPath)) {
  for (const line of fs.readFileSync(devEnvPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;

    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next.js 16 uses Turbopack by default.
  // Turbopack doesn't need the canvas alias because it only bundles what's actually imported.
  // We add an empty turbopack config to silence the webpack/turbopack config mismatch warning.
  turbopack: {},

  // The webpack config below is kept for environments that explicitly opt-in to webpack
  // (e.g. `next build --webpack`). It resolves pdfjs-dist's optional canvas dependency.
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        canvas: false,
      };
    }
    return config;
  },
};

export default nextConfig;
