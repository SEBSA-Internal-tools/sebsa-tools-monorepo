# Render API + Vercel frontend deployment

Pilot target: https://github.com/CharithSL26/Repo_SDP, branch `test`.
Keep the Nx monorepo together. Deploy its two apps independently from the
repository root so both builds can access `packages/*` and the root lockfile.

## Architecture and service selection

Browser -> Vercel frontend -> `/api/*` external rewrite -> Render NestJS -> Neon.
Render also calls Brevo over HTTPS for invitations, resets and queued task emails.

- Backend: Render **Web Service**, native **Node**, Free for this pilot.
- Frontend: Vercel **Project**, framework **Vite**; static output, no API functions.
- Database: existing Neon PostgreSQL, preferably a dedicated pilot branch.
- Disk: none. Attachments currently store data URLs in PostgreSQL `storageRef`.

The frontend already calls `/api`; Vite's localhost proxy only runs during local
development. `vercel.mjs` replaces that proxy in hosting. Keep `/api` on the same
browser origin: authentication uses host-only Secure, SameSite=Lax cookies plus
a readable CSRF cookie. A direct browser call to an unrelated Render domain
would require a separate cookie/CSRF design, not just replacing a URL.

Render Free sleeps after 15 idle minutes and takes time to wake. While asleep,
the API's email dispatcher cannot retry queued emails. This is suitable for a
pilot with that limitation accepted. Vercel Hobby is limited to personal,
non-commercial use; a company/internal business pilot may require Pro even if
it is called a demo. This configuration does not select or purchase a paid plan.

## 1. Prepare accounts and database

1. Connect GitHub to Render and Vercel and grant access to `Repo_SDP`.
2. For assistant-managed deployment, install/connect the Render and Vercel
   integrations. Provide secrets through the hosts' secure environment settings.
3. The currently configured Neon endpoint is in Singapore (AWS ap-southeast-1);
   choose Render Singapore if retaining that database. Confirm the region if
   selecting another Neon branch/project. Do not recreate
   the database in Render. Use a dedicated Neon branch for pilot/preview data if
   the existing database contains data that must not be affected.
4. Copy Neon's pooled URL for `DATABASE_URL` and non-pooled URL for `DIRECT_URL`.
   Both must reference the same Neon branch and database, with `sslmode=require`.
5. Confirm Brevo's sender is verified and the API key has permission to send.
6. Choose the Vercel project name and reserve/confirm its production domain. The
   actual assigned URL, rather than a guessed project-name URL, is authoritative.

## 2. Verify and push the prepared code

From the repository root, using Node 24 and the committed npm lockfile:

```sh
npm ci --include=dev
npm run build --workspace @sdp/api
npm run build --workspace @sdp/web
```

API output: `dist/apps/api/main.js`; frontend output: `dist/apps/web`.
These commands build only the selected app, including its shared source imports.
The API build generates Prisma Client without applying database migrations.
Local verification completed: frontend type-check/build, API esbuild bundle,
340 API unit tests, and deployment configuration assertions passed. The full
API workspace build was blocked during Prisma generation by a Windows engine
DLL file lock. Render must still verify a fresh Linux installation/build.

A read-only check of the current Neon database found one pending migration:
`20261010000000_notification_email_delivery`. No migration was applied locally;
Render startup will apply pending migrations to the configured target database.

Commit the deployment files and push to `test` after reviewing the diff. Never
commit `.env` values. The example environment files contain placeholders only.

## 3. Create the Render backend

Preferred: Render Dashboard -> **New -> Blueprint**, select the repository and
`test` branch, and apply root `render.yaml`. Inspect the Free plan and region
before creating the service. Render prompts for variables marked `sync: false`.

Alternatively, **New -> Web Service** with these exact settings:

| Setting           | Value                                                                                                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository        | `CharithSL26/Repo_SDP`                                                                                                                                                 |
| Branch            | `test`                                                                                                                                                                 |
| Root Directory    | Leave blank (repository root)                                                                                                                                          |
| Runtime           | Node                                                                                                                                                                   |
| Plan              | Free for pilot                                                                                                                                                         |
| Build Command     | `npm ci --include=dev && npm run build --workspace @sdp/api`                                                                                                           |
| Start Command     | `DATABASE_URL="${DIRECT_URL:?Set DIRECT_URL to the Neon direct connection URL}" npm run prisma:migrate:deploy --workspace @sdp/api && exec node dist/apps/api/main.js` |
| Health Check Path | `/api/health`                                                                                                                                                          |
| Node version      | `NODE_VERSION=24`                                                                                                                                                      |

Add all values from `apps/api/.env.production.example` to Render. In particular:

- `NODE_ENV=production`, `COOKIE_SECURE=true`, `EMAIL_ENABLED=true`.
- `DATABASE_URL` pooled; `DIRECT_URL` direct. Migration overrides only the
  migration process's `DATABASE_URL`; the API keeps its pooled connection.
- `APP_BASE_URL` is the final HTTPS **frontend** origin; email links and allowed
  request origins derive from it. Omit `FRONTEND_ORIGIN` unless extra origins
  are deliberately needed. Never use localhost or the backend URL here.
- Two different random JWT secrets, each at least 32 characters. Blueprint
  deployment generates these. Keep them stable across routine deployments.
- Brevo API key, verified sender, sender name and support address.
- `TRUST_PROXY=1` initially trusts the immediate Render proxy. Verify actual
  client IPs through Vercel before changing this; do not assume that two hosting
  providers means a hop count of 2, and never set `TRUST_PROXY=true`.
- Let Render supply `PORT`; the application listens on `0.0.0.0`.

Production validation deliberately refuses disabled email, insecure cookies,
non-HTTPS frontend origins, short/missing JWT secrets or a database URL without
TLS. Use the real hosted settings rather than uploading the development `.env`.

On Free, migrations run at service startup because pre-deploy hooks require a
paid service. Restarting also runs `migrate deploy` (already applied migrations
are skipped); this adds startup time. On an always-on paid service, move the
migration command to **Pre-Deploy Command** and use
`node dist/apps/api/main.js` as the Start Command. Never use `migrate dev`,
`db push`, database reset or a seed command in automatic startup.

Review deployment logs for successful migrations and API startup. Record the
actual assigned backend URL, e.g. `https://sdp-api-XXXX.onrender.com`. Confirm
`GET <backend>/api/health` returns JSON with `status: "ok"` and
`environment: "production"`. This is a liveness endpoint; it does not query the
database on every request, so also verify authenticated database operations.

## 4. Bootstrap only a fresh database

If existing users/master data are present, skip this step. For a fresh database,
run the existing seed once from a trusted local shell or CI with the target
connection in the environment (Free Render does not provide a service shell):

```sh
npm run prisma:seed --workspace @sdp/api
```

Set the target `DATABASE_URL` and temporary `BOOTSTRAP_SUPER_ADMIN_EMAIL`,
`BOOTSTRAP_SUPER_ADMIN_PASSWORD`, `BOOTSTRAP_SUPER_ADMIN_NAME` in that shell first.
The seed creates reference data and the first super administrator. It can reset
an existing bootstrap user's password and update reference data, so review the
target first. Remove temporary bootstrap credentials after running it. Do not
run `prisma:seed:dev-users` in a hosted environment.

## 5. Create the Vercel frontend

1. Vercel -> **Add New -> Project**, import the same GitHub repository.
2. Keep **Root Directory** at the repository root, choose **Vite**, Node **24.x**.
   `vercel.mjs` supplies the install/build/output settings:
   - Install: `npm ci --include=dev`
   - Build: `npm run build --workspace @sdp/web`
   - Output: `dist/apps/web`
3. Set **Production Branch** to `test` in project Git settings; redeploy if the
   first import used GitHub's default branch instead.
4. Add **API_ORIGIN** to Production environment variables, with the exact Render
   HTTPS origin, e.g. `https://sdp-api-XXXX.onrender.com`. No `/api` suffix, port,
   credentials, query or path. This is deployment configuration, not a secret
   and not a `VITE_*` variable. Redeploy after changing it.
5. Deploy. The config refuses a missing/malformed API origin. `/api/*` is
   forwarded unchanged before the SPA fallback, with API caching disabled;
   frontend deep links fall back to `index.html`.
6. Compare the assigned frontend domain with Render's `APP_BASE_URL`; update
   Render and redeploy/restart it if they differ.
7. Keep database credentials, JWT secrets and Brevo keys exclusively in Render.
   No backend secrets belong in Vercel or a Vite frontend bundle.

Do not point arbitrary preview deployments at the pilot/production database.
Use a separate preview API and Neon branch with explicit allowed origins, or
leave Preview API_ORIGIN unset so those deployments fail closed. The public
password-link endpoints check Origin, so a new preview hostname also requires
an intentional backend allow-list change. For a custom domain, add it in
Vercel, complete DNS/HTTPS, update Render APP_BASE_URL, and re-test email links.
The backend can keep its onrender.com domain.

## 6. Acceptance checks before sharing the URL

1. Open `<frontend>/api/health`: JSON, not the SPA HTML.
2. Open and reload a nested frontend route: the SPA loads correctly.
3. Login: Secure/HttpOnly access and refresh cookies, readable Secure CSRF
   cookie; all cookies belong to the frontend host. No cookie Domain override.
4. Perform an authorized create/update: CSRF header succeeds and data persists.
5. Refresh a session and log out; confirm authenticated routes reject logout.
6. Send an invite and password reset to a controlled mailbox; verify Brevo
   delivery and links use the frontend domain. Check queued task emails too.
7. Upload and retrieve an attachment; check database quota and request size.
8. Check API responses have no-store headers and are not served from a cache.
9. Check logged request IPs for two clients; verify proxy forwarding and rate
   limiting before changing TRUST_PROXY. In-memory rate limits are per-instance.
10. Allow the Free API to sleep and test wake-up behavior; document the delay
    and delayed queued email delivery for pilot users.

A successful local build does not prove Linux dependency installation, hosted
cookie forwarding, database permissions, email delivery or account quotas.
Those require the above hosted checks. Existing source maps are build artifacts;
if exposing frontend sources is unacceptable, disable Vite production source
maps before release.

## 7. Updates, monitoring and recovery

Enable deployment from `test` only after the initial verification. Watch Render
startup/errors/memory, Brevo failures and Neon storage/connections. Database
attachments consume Neon storage despite having no Render disk. A paid,
always-on Render instance is the first upgrade for reliable API/email behavior.

Use additive/backward-compatible database changes: startup migrations can run
while the prior deployment is still serving traffic. Rolling back application
code does not roll back Prisma migrations. Use Neon backups/branches and review
SQL before schema changes. Keep development email dispatch off when sharing a
database with the hosted service.

## Official references

- [Render Web Services](https://render.com/docs/web-services)
- [Render monorepos](https://render.com/docs/monorepo-support)
- [Render free limitations](https://render.com/docs/free)
- [Render pre-deploy commands](https://render.com/docs/deploys)
- [Vercel programmatic configuration](https://vercel.com/docs/project-configuration/vercel-ts)
- [Vercel external rewrites and caching](https://vercel.com/docs/routing/rewrites)
- [Vercel Hobby restrictions](https://vercel.com/docs/plans/hobby)
