# Netlify full-stack deployment

Target: https://quiet-gnome-314af2.netlify.app
Site ID: 3acf246d-cebe-4c1f-af02-0ad5471b5de7
Repository: CharithSL26/Repo_SDP, branch test.

## Build and routing

Use repository root as base, `npm run build:netlify` as build command,
`dist/apps/web` as publish directory and `dist/netlify/functions` as functions
directory. Root `netlify.toml` sets these values. Use Node 24 with dev dependencies
included for TypeScript, SWC and Vite. The API is a Lambda-compatible NestJS
function initialized once per warm instance; it does not listen on a port.

`/api/*` rewrites to the API function before the SPA fallback. The frontend's
relative `/api` calls, session cookies and readable CSRF cookie stay on the same
HTTPS origin. No hosted backend URL belongs in the browser bundle.

For local Vite development, copy `apps/web/.env.example` to `apps/web/.env` and
set `SDP_API_TARGET` to either the local API or the Netlify site's HTTPS origin
without an `/api` suffix. Shell settings take precedence, preserving Playwright's
isolated backend. Vite's development proxy is not used by a hosted static build.

The Netlify build generates an independent `@sdp/netlify-prisma` with the
AWS Lambda `rhel-openssl-3.0.x` engine. The functions bundle includes this engine
and argon2 Linux prebuilds; normal local/Render Prisma generation is unaffected.

## Environment settings

Use `.env.netlify.example` as reference. Backend credentials must be set in
Netlify's **Functions** scope, **Production** context. Never use VITE_ prefixes
for database credentials, JWT signing secrets or Brevo keys.

Set NODE_ENV=production, COOKIE_SECURE=true, EMAIL_ENABLED=true,
APP_BASE_URL=https://quiet-gnome-314af2.netlify.app and AWS_LAMBDA_JS_RUNTIME=nodejs24.x.
FRONTEND_ORIGIN normally derives from APP_BASE_URL; remove any localhost override.
PORT is not used by these functions. Keep two different 32+ character JWT secrets
and a Brevo-verified sender. API production validation checks the required values.

EMAIL_DISPATCH_SECRET is a separate random 32+ character secret in Functions scope.
It protects the background email endpoint; keep it stable across deployments.

## Queued email delivery

The API disables interval/kick timers in serverless mode. Every five minutes,
`email-schedule` triggers the authenticated `emails-background` function. The
background function claims at most two batches (40 messages) with the existing
Postgres lease/SKIP LOCKED protection. Invites/password resets still send in the
request flow. Task emails may take up to five minutes plus retry time.

Schedules run only on the published deployment; draft deployments can be tested
with Netlify's Run now control. Keep previews away from production credentials
and production email delivery. HTTP function URLs must not invoke the scheduler;
Netlify enforces scheduled function access. The background endpoint explicitly
validates its bearer secret before initializing Nest or accessing the database.

## Database migrations

Do not run migrations on every invocation or during an arbitrary preview build.
Before publishing schema-dependent code, check the configured Neon target and
apply reviewed migrations once from a trusted shell/controlled CI:

```sh
npm run prisma:migrate:status --workspace @sdp/api
npm run prisma:migrate:deploy --workspace @sdp/api
```

Use Neon's direct connection as DATABASE_URL for these commands. The application's
runtime DATABASE_URL should be pooled. Never use migrate dev, db push, reset or
dev-user seeds on this database. The notification-email enum, five columns and index already existed and exactly matched the migration. Prisma history was reconciled with migrate resolve --applied; all 17 migrations are current.

## Netlify limits and verification

Netlify buffered functions have a 6 MB payload limit, smaller than this app's
existing dedicated-server upload limits. The Netlify frontend rejects JSON bodies
above 4.5 MB before sending them and displays a request-size error. This includes
all screenshots in a review save, not just one attachment. Large existing response
payloads also need testing; move large media to object storage for broader use.
Cold starts and Neon network latency affect function response time. Existing
in-memory rate limits are per warm instance, not global across Lambda instances;
shared rate limiting is required before broader public/production rollout.

Verify /api/health returns JSON with production environment, nested frontend
route reloads work, and anonymous protected API requests return 401 JSON. Then
verify login, all Set-Cookie headers, CSRF-protected writes, session refresh,
logout, screenshot upload/retrieval, a controlled invite/reset, and a queued
notification. Check that all three functions are in the published deploy and
that the schedule is registered. An API liveness check alone does not verify
email delivery or application database operations.

## Deploy from this workspace

Netlify CLI is authorized and linked to the existing site. CLI monorepo commands
need `--filter @sdp/web`; the root netlify.toml controls the full-stack build.

```sh
npx netlify-cli deploy --context production --filter @sdp/web
npx netlify-cli deploy --prod --context production --filter @sdp/web
```

A CLI deployment uploads the working build without committing source. Commit and
push the reviewed source/configuration to test to keep future Git deployments
consistent. Never add `.netlify`, generated Prisma clients, dist or .env secrets.

Official references:

- https://docs.netlify.com/build/frameworks/framework-setup-guides/express/
- https://docs.netlify.com/build/functions/configuration/
- https://docs.netlify.com/build/functions/scheduled-functions/
- https://docs.prisma.io/docs/orm/v6/prisma-client/deployment/serverless/deploy-to-netlify

Local verification: the Netlify build/function bundling, API type checks, 347 API
unit tests and seven targeted frontend transport/attachment tests passed. Function
archives are about 93 MB uncompressed for API/email worker, within Lambda limits;
the Linux Prisma engine is included and unrelated local Prisma files are excluded.
