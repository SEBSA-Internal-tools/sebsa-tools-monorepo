# Database Architecture

This document describes the backend data infrastructure for the SEBSA Internal
Project Management Tool: the PostgreSQL schema, how it was derived from the
[Functional Specification Document](<./SEBSA_PMT_Functional_Specification_v1_4%201.docx>)
(FSD v1.4), and the day-to-day Prisma/Docker workflows for developers.

## Contents

- [Folder structure](#folder-structure)
- [Docker setup](#docker-setup)
- [Environment configuration](#environment-configuration)
- [Prisma workflow](#prisma-workflow)
- [Migration workflow](#migration-workflow)
- [Entity relationship overview](#entity-relationship-overview)
- [Design decisions & FSD assumptions](#design-decisions--fsd-assumptions)
- [Constraints added by hand](#constraints-added-by-hand)
- [Common commands](#common-commands)

## Folder structure

```
sebsa-pm-tool/
├── docker/
│   ├── docker-compose.yml     # Postgres + pgAdmin for local dev
│   └── .env.example           # docker-compose variables (copy to docker/.env)
├── prisma/
│   ├── schema.prisma          # Single source of truth for the DB schema
│   └── migrations/            # Timestamped, checked-in SQL migrations
├── libs/
│   └── core/
│       └── src/lib/prisma/
│           ├── prisma.module.ts   # Global PrismaModule
│           └── prisma.service.ts  # PrismaService (connect/disconnect lifecycle)
├── apps/
│   └── ipm-be/
│       └── src/
│           ├── config/             # Typed ConfigModule factories + Joi validation
│           └── app/app.module.ts   # Wires ConfigModule + PrismaModule
├── .env.example                # NestJS app variables (copy to .env)
└── docs/
    └── database-architecture.md   # This file
```

`PrismaModule`/`PrismaService` live in `libs/core` (not inside `apps/ipm-be`)
so any future app or library in this Nx workspace can inject `PrismaService`
without duplicating the connection logic.

## Docker setup

`docker/docker-compose.yml` defines two services on a dedicated bridge
network (`sebsa-pm-network`) with named, persistent volumes:

| Service      | Image                  | Purpose                        | Default host port            |
| ------------ | ---------------------- | ------------------------------ | ---------------------------- |
| `postgres` | `postgres:16-alpine` | Application database           | `5432` (`DATABASE_PORT`) |
| `pgadmin`  | `dpage/pgadmin4`     | Web UI for inspecting Postgres | `5050` (`PGADMIN_PORT`)  |

Both services use `restart: unless-stopped` and read all credentials from
environment variables — nothing is hardcoded in the compose file.

### Starting Postgres

```bash
cd docker
cp .env.example .env   # first time only — fill in real values
docker compose up -d
```

This starts both `postgres` and `pgadmin`. To start only the database:

```bash
docker compose up -d postgres
```

Data persists in the named volume `sebsa-pm-postgres-data` across restarts;
`docker compose down` stops the containers without deleting it, `docker compose down -v` deletes the volumes too.

### Accessing pgAdmin

1. Open `http://localhost:5050` (or your configured `PGADMIN_PORT`).
2. Log in with `PGADMIN_DEFAULT_EMAIL` / `PGADMIN_DEFAULT_PASSWORD` from
   `docker/.env`.
3. Register a new server pointing at host `postgres` (the service name on the
   `sebsa-pm-network` bridge network), port `5432`, using the
   `DATABASE_USER` / `DATABASE_PASSWORD` / `DATABASE_NAME` from the same file.

## Environment configuration

Two separate `.env` files exist, because docker-compose and the NestJS app
read variables from different working directories:

- **`docker/.env`** (from `docker/.env.example`) — consumed by
  `docker compose` when run from the `docker/` directory. Controls the
  Postgres and pgAdmin containers only.
- **`.env`** at the workspace root (from `.env.example`) — consumed by
  Prisma CLI and the NestJS app (`@nestjs/config`). Must point at the same
  host/port/credentials as `docker/.env` for local development.

Neither file is committed; both are covered by `.gitignore`.

`apps/ipm-be/src/config/env.validation.ts` uses Joi to fail fast at startup
if a required variable is missing or malformed — there is no hardcoded
configuration anywhere in the app.

## Prisma workflow

- `prisma/schema.prisma` is the single source of truth for the schema.
- The generated client is emitted to `node_modules/@prisma/client` (the
  classic `prisma-client-js` generator), so it's imported the same way
  anywhere in the monorepo: `import { PrismaClient } from '@prisma/client'`.
- `PrismaService` (`libs/core/src/lib/prisma/prisma.service.ts`) extends
  `PrismaClient`, reads the connection URL from `ConfigService`
  (`database.url`, itself sourced from `DATABASE_URL`), and:
  - connects in `onModuleInit()`,
  - disconnects in `onModuleDestroy()`.
- `main.ts` calls `app.enableShutdownHooks()` so `onModuleDestroy()` actually
  fires on `SIGINT`/`SIGTERM` (Ctrl+C, container stop, etc.) — the
  database connection is always closed gracefully.
- `PrismaModule` is `@Global()` and exported from `@sebsa-pm-tool/core`, so
  any feature module can inject `PrismaService` without re-importing it.

## Migration workflow

Migrations are checked into `prisma/migrations/` and are the source of truth
for the actual database schema.

```bash
# 1. Edit prisma/schema.prisma

# 2. Generate a new migration from the diff (dev database)
npx prisma migrate dev --name <short_description>

# 3. Regenerate the Prisma Client (also runs automatically after migrate dev)
npx prisma generate

# 4. Apply pending migrations in another environment (CI/staging/prod)
npx prisma migrate deploy
```

A dev-only seed exists at `prisma/seed.ts`, wired via `package.json#prisma.seed`
(the classic config style — a `prisma.config.ts` was tried instead but it
disables Prisma's automatic `.env` loading, which everything else in this repo
relies on, so it was reverted). Run it with:

```bash
npx prisma db seed
```

It `upsert`s exactly one `Department` and one `SYSTEM_ADMIN` test user (prints
the test credentials to stdout) so authentication can be exercised end-to-end
without a real user existing yet — it is idempotent and safe to re-run, and
is not meant to represent real data.

### A note on the initial migration

Prisma's schema DSL has no syntax for **partial/conditional unique indexes**
or **CHECK constraints**, so three FSD business rules were added by hand to
`prisma/migrations/<timestamp>_init/migration.sql` after generating it — see
[Constraints added by hand](#constraints-added-by-hand). If you ever need to
`prisma migrate reset` or regenerate this migration from scratch, re-apply
those three statements manually (they live at the bottom of the file, in a
clearly marked "Hand-authored constraints" section).

## Entity relationship overview

Grouped by functional area:

**Identity & Access**

- `Department` 1—N `User`
- `User.systemRole` (`SYSTEM_ADMIN` / `EXECUTIVE` / `REGULAR_USER`) — system-wide tier
- `Project` 1—N `Role` (project-scoped, custom permission flags)
- `Project` 1—N `ProjectMember` N—1 `User`, each with one `Role`

**Projects**

- `Project` 1—N `WorkflowStage` (customizable per-project task statuses)
- `Project` 1—N `Milestone`
- `Project` 1—N `Sprint`
- `Project` 1—N `Label`

**Tasks**

- `Task` N—1 `WorkflowStage` (current status)
- `Task` 1—N `Task` (self-relation via `parentTaskId`, for subtasks)
- `Task` N—1 `Sprint?` (null = backlog), N—1 `Milestone?`
- `Task` N—N `User` via `TaskAssignee`
- `Task` N—N `User` via `TaskWatcher` (watch/follow)
- `Task` N—N `Label` via `TaskLabel`
- `Task` N—N `Task` via `TaskDependency` (BLOCKS / RELATES_TO / DUPLICATE_OF)
- `Task` 1—N `TaskStatusHistory` (workflow-stage transitions, for time-in-status)

**Collaboration** 

- `Task` 1—N `Comment`, `Comment` 1—N `Comment` (self-relation, threaded replies)
- `Comment` 1—N `CommentMention`
- `Attachment` optionally belongs to a `Task` **or** a `Comment` (exactly one)

**Audit, Notifications, Search**

- `ActivityLog` — single immutable ledger (see below)
- `Notification` / `NotificationPreference` — per-user, per-channel
- `SavedFilter` — per-user named filter combinations

**Integrations & API**

- `Integration`, `Webhook` — per-project configuration
- `ApiToken` — per-user REST API tokens

## Design decisions & FSD assumptions

The FSD does not specify a physical data model, so the following judgment
calls were made while normalizing it. Flag any of these to the technical
architect if they don't match intent:

1. **Executive/Senior Manager is a `SystemRole`, not a project `Role`.**
   This role "read-only access to **all** projects" — modeling
   it as a `ProjectMember` row would require adding every executive to every
   project. Instead, `User.systemRole` has three tiers
   (`SYSTEM_ADMIN` / `EXECUTIVE` / `REGULAR_USER`), and Project
   Owner/Manager/Member/Viewer remain project-scoped `Role` rows.
2. **Milestone ↔ Task is one-to-many**, not many-to-many. `Task.milestoneId`
   is a single nullable FK. This matches how the FSD describes milestone
   progress ("tracked as associated tasks complete") without over-normalizing
   into a join table for a relationship the FSD never describes as
   many-sided.
3. **Task type enum uses the 7-value "Task Type Definitions" table**
   (Epic, Story, Task, Bug, Improvement, Test, Sub-task),
   rather than the 5-value list mentioned earlier in the same section, since
   the definitions table is the more complete, authoritative source.
4. **Subtasks are `Task` rows with a self-referencing `parentTaskId`**, not a
   separate `Subtask` table. Requires each subtask to carry its own
   assignee, status, and due date — i.e. the full shape of a `Task` — so
   duplicating that shape in a second table would violate normalization.
5. **`TaskDependency` stores only one direction per link.** A row
   `(source, BLOCKS, target)` means "source blocks target" (target is
   blocked-by source). The inverse `BLOCKED_BY` view is derived at query
   time from `Task.incomingLinks` instead of writing a second, mirrored row.
   Circular-dependency prevention is a graph-traversal rule
   enforced in the application/service layer — it cannot be expressed as a
   database constraint.
6. **`ActivityLog` is a single, immutable, append-only table** backing the
   Task Activity Log, Project Timeline View, Contributor Summary, and Global
   Audit Log requirements, instead of one log table per
   entity. `entityType` + `entityId` act as a polymorphic pointer — `entityId`
   is a plain UUID column, not a foreign key, because one table cannot hold a
   real FK to many unrelated parent tables. The trade-off: referential
   integrity for log entries is enforced by the application, not the
   database. This was deemed acceptable since log rows are never the target
   of a cascade and are immutable once written.
7. **`Department` is a normalized lookup table**, not a free-text column on
   `User`. Requires department-based grouping/filtering, which a
   free-text field would make inconsistent (typos, casing drift).
8. **Nice-to-Have items are not modeled yet**: emoji reactions on comments
   and CI/CD build-status sync are deferred — adding them
   now would be speculative schema for features not yet prioritized.
9. **Section 9 "Future Implementations" are explicitly out of scope**: no
   time-tracking/billing tables, Gantt/critical-path fields, ERP sync, or
   AI-feature tables exist in this schema. "Auto - Time
   Monitoring" (Must Have, distinct from future billable time tracking) is
   covered by `TaskStatusHistory`, which lets time-in-stage be computed by
   diffing consecutive `changedAt` timestamps per task.
10. **`Integration` / `Webhook` / `ApiToken` are included now**, even though
    authentication/business logic isn't implemented yet, because
    the underlying features Must-Have and the tables are structural
    only (no auth logic wired up in this task).

## Constraints added by hand

Prisma's schema DSL cannot express partial/conditional unique indexes or
CHECK constraints. These three business rules are therefore appended as raw
SQL at the bottom of `prisma/migrations/<timestamp>_init/migration.sql`,
with `schema.prisma` documented (via comments) to explain why the DSL-level
constraint doesn't fully match what the database enforces:

1. **Max one active sprint per project**:

   ```sql
   CREATE UNIQUE INDEX "sprints_one_active_per_project"
     ON "sprints"("projectId") WHERE "status" = 'ACTIVE';
   ```
2. **One active membership per user per project** (removed
   members are soft-deleted so their historical contributions survive, but a
   removed member must be able to be re-added later without hitting a
   uniqueness conflict against their old, soft-deleted row):

   ```sql
   CREATE UNIQUE INDEX "project_members_one_active_per_user"
     ON "project_members"("projectId", "userId") WHERE "deletedAt" IS NULL;
   ```
3. **Attachment belongs to exactly one parent** (a file is
   attached to a task *or* a comment, never both, never neither):

   ```sql
   ALTER TABLE "attachments" ADD CONSTRAINT "attachments_exactly_one_parent"
     CHECK ((("taskId" IS NOT NULL)::int + ("commentId" IS NOT NULL)::int) = 1);
   ```

## Common commands

| Command                                               | Purpose                                            |
| ----------------------------------------------------- | -------------------------------------------------- |
| `docker compose -f docker/docker-compose.yml up -d` | Start Postgres + pgAdmin                           |
| `docker compose -f docker/docker-compose.yml down`  | Stop containers (keep data)                        |
| `npx prisma studio`                                 | Browse/edit data in a local GUI                    |
| `npx prisma format`                                 | Format and lint-check`schema.prisma`             |
| `npx prisma validate`                               | Validate the schema without touching the DB        |
| `npx prisma migrate dev --name <name>`              | Create + apply a new migration (dev)               |
| `npx prisma migrate deploy`                         | Apply pending migrations (CI/staging/prod)         |
| `npx prisma migrate status`                         | Show which migrations are applied/pending          |
| `npx prisma generate`                               | Regenerate the Prisma Client after a schema change |
| `npx nx serve ipm-be`                               | Run the NestJS API locally                         |
