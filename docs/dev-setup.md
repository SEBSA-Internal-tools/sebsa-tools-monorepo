# Developer setup

How to run the SEBSA Employee Management Portal (CV Generator + Assessments) without touching
production. Production data is never needed for development: everything below uses a **synthetic
seed**.

## 1. Pick a database

| | A. Local Docker (default) | B. Shared dev project |
|---|---|---|
| Isolation | Private to you; reset any time | Shared by the team |
| Needs | Docker Desktop | Credentials from the team password manager |
| Best for | Day-to-day work, trying migrations | Demos, integration testing, SSO/email trials |

Use **A** for development. Use **B** to show something to others or test against a hosted URL.
Never develop against production.

### A. Local Docker

```bash
npm install
npx supabase start -x vector,logflare,edge-runtime,imgproxy,supavisor   # first run pulls images
cp .env.development.local.example .env.development.local
npx supabase status -o env      # copy API_URL, ANON_KEY, SERVICE_ROLE_KEY into the file
npm run dev
```

`supabase start` on an empty database applies every file in `supabase/migrations/` and then
`supabase/seed.sql`. To get back to a clean slate at any time:

```bash
npx supabase db reset
```

Studio (database browser): http://127.0.0.1:54323 · Mail catcher: http://127.0.0.1:54324

### B. Shared dev project

Put the shared project's URL and keys (from the password manager) in `.env.development.local`
instead of the local ones. Do **not** put them in `.env.local`.

> `next dev` reads `.env.development.local` after `.env.local`, so it wins even if you hold a
> production `.env.local`. `next build` / `next start` do **not** read `.env.development.local`.

## 2. Sign in

Every seeded account uses the password **`DevPass-123!`**.

| Email | Role | Notes |
|---|---|---|
| `super.admin@sebsa.test` | Super Admin | Assessment manager |
| `admin@sebsa.test` | Admin | Not an assessment manager |
| `reviewer@sebsa.test` | CV Reviewer | HR: assessment manager |
| `employee1@sebsa.test` | Employee | Has a profile and a sample CV |
| `employee2@sebsa.test` | Employee | Has a profile |
| `newhire@sebsa.test` | Employee | No profile: exercises onboarding |

The seed also adds 7 profiles, 15 made-up assessment questions and one active "DEV Sample Cycle"
with invitations for four of the accounts. The real question bank is confidential and is **not** in
the repository.

If another program already uses port 3000 on your machine, browse to `http://127.0.0.1:3000`
(IPv4) rather than `localhost`.

## 3. Email is off in development

Leave the `BREVO_*` and `EMAIL_FROM_ADDRESS` variables empty. Sends then fail quietly ("Failed to
send email" in the log), which is what you want: no test action can email a real person. Invitation
rows show as "email failed" in the tracker; that is expected.

## 4. Changing the database schema

**All schema changes go through a migration file. Never change a database by hand in the Supabase
dashboard**, including production. Production drifted exactly that way once (soft-delete columns
added by hand and never committed); migration `0032_reconcile_with_production.sql` repaired it.

1. Create the file with the CLI so the name is a timestamp, which cannot collide with a teammate's
   branch (the old `0001`–`0032` numbering is kept; new files sort after it):
   ```bash
   npx supabase migration new add_something
   ```
2. Write idempotent SQL where you can (`if not exists`, `drop policy if exists` then `create`).
   Valid Postgres only: `create policy if not exists` does not exist.
3. Test from scratch: `npx supabase db reset`, then run the app / checks.
4. **Never edit a migration that has already been applied anywhere.** Add a new one.
5. Apply to the shared dev project (needs the dev connection string from the password manager):
   ```bash
   npx supabase db push --db-url "postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres"
   ```
   The dev project records its history in `supabase_migrations.schema_migrations`, so only new
   files are applied.
6. **Production** is changed only by the project owner, after review, with a fresh backup. Do not
   run migrations against it yourself.

If you add a feature that needs sample rows, extend `supabase/seed.sql` (keep it idempotent and
synthetic).

## 5. Ground rules

- No real employee data, real email addresses, passwords or API keys in the repository, the seed,
  or the dev project. Seed addresses use the reserved `.test` domain.
- Secrets live in gitignored env files and the password manager, never in chat or commits.
- The assessment answer key must never reach the browser; keep that logic in
  `services/assessment-service.ts` (see `docs/04-rbac-security.md` section 18).
