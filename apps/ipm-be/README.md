# `ipm-be` — SEBSA PMT Backend

NestJS API for the SEBSA Internal Project Management Tool. This is a quick
orientation for developers working in this app specifically — for the
database schema and authentication/authorization model, see
[`docs/database-architecture.md`](../../docs/database-architecture.md) and
[`docs/authentication.md`](../../docs/authentication.md) at the repo root;
this file doesn't repeat those.

## Running it

```bash
npx nx serve ipm-be
```

Runs on `http://localhost:3000/api`. Interactive API docs (Swagger UI) are
at `http://localhost:3000/api/docs` — log in via `POST /api/auth/login`,
paste the returned token into the "Authorize" button, and you can call any
guarded endpoint straight from the browser.

## Getting your machine up to date

Whenever you pull changes that touch `prisma/schema.prisma`,
`prisma/migrations/`, or `package.json`, run this before anything else —
these are the exact steps that have caused real breakage on this project
when skipped:

```bash
git pull
npm install                          # picks up any new dependency
npx prisma generate                  # resyncs your local Prisma Client to the schema
```

Then **restart your dev server** — a running `nx serve` process already has
the old Prisma Client loaded in memory; regenerating files on disk doesn't
reach into it. If your editor still shows type errors that don't match
reality after that, restart its TypeScript server too (VS Code:
Cmd/Ctrl+Shift+P → "TypeScript: Restart TS Server") — it caches type info
independently of what's actually on disk.

You do **not** need to run `npx prisma migrate deploy` yourself in the
normal case — the team shares one Neon database, so whoever wrote a
migration already applied it before merging. `npm install`/`prisma
generate` just sync your local files to match what's already live.

## Folder structure

```
apps/ipm-be/src/
├── main.ts              # bootstrap: global prefix, validation pipe, CORS, Swagger
├── config/               # typed ConfigModule factories + Joi env validation
└── app/
    ├── app.module.ts     # wires every feature module together
    ├── auth/             # JWT login/register, JwtAuthGuard, RolesGuard, @CurrentUser()
    ├── projects/          # projects, project-scoped roles, membership
    ├── tasks/             # tasks, labels, dependencies, subtasks
    ├── users/             # user search + admin user management
    ├── departments/       # department lookup (signup form, user records)
    └── privilege-groups/  # system-wide reusable permission bundles
```

Every feature module follows the same shape — this is the pattern to copy
for a new one, `projects/` is the clearest reference example:

```
<feature>/
├── <feature>.module.ts     # controllers + providers, imports AuthModule if guarded
├── <feature>.controller.ts # routes only — thin, delegates to the service
├── <feature>.service.ts    # business logic, talks to PrismaService directly
└── dto/                    # class-validator request shapes
```

**Deliberately no repository layer.** `PrismaService` (`libs/core`) already
*is* a typed repository per model — an extra repository class wrapping it
adds a file and a DI hop without adding real abstraction, since there's
only one ORM and one database here. Validation/permission checks live as
private `assert*`/`validate*` methods directly on the service (see
`ProjectsService.assertCanEdit`, `TaskService.assertCanCreate`, etc.), not
as a separate injectable — keeps everything about one feature's business
rules in one file.

**Authorization** is two independent layers — see
[`docs/authentication.md`](../../docs/authentication.md#authorization) for
the full picture — but in short: `SystemRole` (`SUPER_ADMIN`/`ADMIN`/
`EXECUTIVE`/`REGULAR_USER`) via `@Roles()` + `RolesGuard` for coarse,
system-wide gates, and project-scoped `PrivilegeGroup` flags
(`canCreateTask`, `canManageMembers`, etc.) checked per-request against the
caller's membership for everything that happens inside a specific project.

## Shared types

Request/response shapes that both `ipm-fe` and `ipm-be` need are defined
once in `libs/shared-models` and imported by both — never redeclare a type
that already exists there. `libs/shared-models/src/lib/projects/project.models.ts`
is the reference example for the shape (`XSummary` for list views, `X` for
detail views, `CreateXRequest`/`UpdateXRequest` for writes).

## Database

One shared Neon Postgres instance for the whole team — see
[`docs/database-architecture.md`](../../docs/database-architecture.md) for
hosting, environment setup, and the full migration workflow. The one thing
worth repeating here: migrations are applied against that shared database
the moment someone runs them, not when the PR merges — if you're picking up
a schema change, assume the database has already moved and get your local
files in sync (see "Getting your machine up to date" above) before you
assume something is broken in your own code.
