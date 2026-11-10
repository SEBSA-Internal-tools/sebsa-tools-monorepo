// Evaluated by Vercel at deployment time, outside the browser bundle.
// Set API_ORIGIN in Vercel to the actual HTTPS origin assigned by Render.
const configuredOrigin = process.env.API_ORIGIN?.trim();
if (!configuredOrigin) {
  throw new Error('Set API_ORIGIN in Vercel, for example https://your-api.onrender.com');
}
const upstream = new URL(configuredOrigin);
if (
  upstream.protocol !== 'https:' ||
  upstream.username ||
  upstream.password ||
  upstream.pathname !== '/' ||
  upstream.search ||
  upstream.hash
) {
  throw new Error(
    'API_ORIGIN must be an HTTPS origin without credentials, paths or query parameters',
  );
}

export const config = {
  framework: 'vite',
  installCommand: 'npm ci --include=dev',
  buildCommand: 'npm run build --workspace @sdp/web',
  outputDirectory: 'dist/apps/web',
  rewrites: [
    { source: '/api/:path*', destination: `${upstream.origin}/api/:path*` },
    { source: '/(.*)', destination: '/index.html' },
  ],
  headers: [
    {
      source: '/api/:path*',
      headers: [
        { key: 'Cache-Control', value: 'private, no-store' },
        { key: 'x-vercel-enable-rewrite-caching', value: '0' },
      ],
    },
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'no-referrer' },
      ],
    },
  ],
};
