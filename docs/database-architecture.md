# Database Architecture

This document describes the backend data infrastructure for the SEBSA Internal
Project Management Tool: the PostgreSQL schema, how it was derived from the
[Functional Specification Document](<./SEBSA_PMT_Functional_Specification_v1_4%201.docx>)
(FSD v1.4), and the day-to-day Prisma workflows for developers.

## Contents

- [Folder structure](#folder-structure)
- [Database hosting](#database-hosting)
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

## Database hosting

The team shares **one Neon Postgres instance** — everyone's app points at the
same database, so everyone sees the same projects/tasks/users. This replaced
local Docker Postgres once the team grew past a couple of people (local
Docker instances are never shared between machines — each person would have
had their own empty database) and once company policy ruled out running
containers on local machines entirely.

Because Prisma only ever talks to whatever `DATABASE_URL` points at, **none
of the schema, migrations, or application code changed** when we moved off
Docker — this was purely an environment-variable swap.

### Getting access

1. Ask a teammate (or whoever administers the Neon project) for the shared
   connection string — it is **not** committed anywhere in this repo, and
   should be treated as a real credential (share it via a password manager or
   similar, not chat/email in plaintext where it'll sit around indefinitely).
2. Copy `.env.example` to `.env` at the workspace root and fill in the real
   `DATABASE_*` values, matching the format already in `.env.example`. Neon
   requires `?sslmode=require` on the connection string — it's already in the
   example.
3. Run `npx prisma generate` once. You do **not** need to run
   `npx prisma migrate deploy` yourself — the schema already exists on the
   shared database; running migrations is only needed when the schema itself
   changes (see [Migration workflow](#migration-workflow)).
4. Ask an admin for a login (admin-only user provisioning, no self-registration
   — see FSD §5.1).

### Browsing the data

Neon's web console (your Neon project dashboard → "Tables"/"SQL Editor") is
the easiest way to look at data directly — no local tooling needed. Prisma
Studio also works against the shared database exactly like it would against
any Postgres instance:

```bash
npx prisma studio
```

Be mindful that both of these let you edit **the real shared data** — this
isn't a personal sandbox anymore.

### Docker (optional, no longer the default)

`docker/docker-compose.yml` still exists and still works if you want a fully
local, disposable Postgres for offline experimentation (or for spinning up an
ephemeral database in CI, where "no containers on laptops" doesn't apply) —
see the file itself for usage. It defines two services: `postgres`
(`postgres:16-alpine`, the actual database) and `pgadmin` (`dpage/pgadmin4`,
a web UI for browsing it, now superseded by Neon's own console for the shared
database). Nobody needs to run either of these for day-to-day development
anymore.

## Environment configuration

`.env` at the workspace root (copied from `.env.example`) is consumed by
Prisma CLI and the NestJS app (`@nestjs/config`). It is never committed —
covered by `.gitignore` — since it holds the real shared database credential.

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
- `User.systemRole` (`SUPER_ADMIN` / `ADMIN` / `EXECUTIVE` / `REGULAR_USER`) — system-wide tier; `SUPER_ADMIN` is additive on top of `ADMIN` (see `docs/authentication.md`)
- `PrivilegeGroup` 1—N `Role` — system-wide, reusable permission-flag bundles (`canCreateTask`, `canDeleteTask`, `canManageMembers`, `canConfigureIntegrations`, `canManageWorkflow`, `isReadOnly`); `Role` no longer owns these flags directly, it references a group
- `Project` 1—N `Role` (project-scoped name + `isSystemDefault`, permissions come from its `PrivilegeGroup`)
- `Project` 1—N `ProjectMember` N—1 `User`, each with one `Role`

**Projects**

- `Customer` 1—N `Project` (every project belongs to exactly one customer — see design decision #12)
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
11. **CSO groundwork (`Project.isCsoProject`/`customerName`,
    `Task.isCsoLabeled`) is modeled now, but Jira-specific fields
    (`jiraProjectKey`, `jiraSiteUrl`, `jiraIssueKey`, `jiraSyncStatus`, etc.)
    are deliberately NOT added yet**, even though an internal planning doc
    lists them as part of the same pass. The Jira sandbox site, OAuth app,
    and public webhook URL this project needs are not set up yet, so nothing
    would read or write those columns — the same speculative-schema mistake
    already made once with `Project.projectNumber`/`Task.taskNumber` (added,
    then fully reverted in
    `prisma/migrations/20260810120557_revert_project_and_task_display_numbers`).
    They'll be designed for real once the Jira sync work actually starts.
12. **`Customer` is a real entity again, not a plain text field on
    `Project`.** The original pass modeled Customer as its own table (FSD
    describes it as one), the team briefly reverted to a free-text
    `Project.customerName` field, and it has now been reinstated as a proper
    entity — full history:
    `prisma/migrations/20260812065952_add_cso_groundwork` (added),
    `prisma/migrations/20260812104437_remove_customer_entity_use_project_field`
    (reverted to free text), and
    `prisma/migrations/20260817090000_add_customer_entity` (reinstated, with
    a data backfill: one `Customer` row created per distinct existing
    `customerName` value, everything else pointed at a fallback "Unassigned"
    customer). `Project.customerId` is now a required FK (`onDelete:
    Restrict`) — every project belongs to exactly one customer, referential
    integrity is enforced by the database, and the CSO Overview page filters
    by an exact `customerId` join instead of a case-insensitive substring
    match. `isCsoProject` remains a separate, independent flag: it controls
    whether a project surfaces on the CSO Overview page, not which customer
    it belongs to (every project has a customer now, CSO or not).

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

A fourth hand-authored statement was added later, in
`prisma/migrations/<timestamp>_add_user_approved_at/migration.sql`, when
`User.approvedAt` was introduced (see `docs/authentication.md`) — a data
backfill rather than a constraint, but the same "Prisma's DSL can't express
this" category:

```sql
UPDATE "users" SET "approvedAt" = "createdAt" WHERE "approvedAt" IS NULL;
```

Existing accounts predate the approval concept entirely; without this
backfill they'd have been retroactively locked out of login by a schema
change that was never meant to affect them.

A fifth migration,
`prisma/migrations/<timestamp>_super_admin_and_privilege_groups/migration.sql`,
combines two hand-authored changes `prisma migrate dev` refused to generate
non-interactively (see `docs/authentication.md` for the feature this
supports):

1. **A true enum value rename**, not drop-and-add — Prisma's diff would have
   dropped `SYSTEM_ADMIN` and added `ADMIN` separately, which fails while
   rows still use the old value:
   ```sql
   ALTER TYPE "SystemRole" RENAME VALUE 'SYSTEM_ADMIN' TO 'ADMIN';
   ALTER TYPE "SystemRole" ADD VALUE 'SUPER_ADMIN';
   ```
2. **Extracting `Role`'s six permission booleans into a new, system-wide
   `PrivilegeGroup` table**, with a backfill matching each existing `Role`
   row's exact flag-tuple to one of four seeded groups (`Owner Access`,
   `Manager Access`, `Member Access`, `Read-Only Access` — the same four
   flag-sets `constants.ts`'s `DEFAULT_PROJECT_ROLES` used to embed
   directly), before dropping the old columns. The live data was queried
   beforehand to confirm exactly four distinct flag-tuples existed (one per
   default role — no custom-role endpoint existed yet at the time), so the
   backfill is deterministic; the migration also raises an explicit
   exception if any row fails to match, rather than silently leaving it
   unmapped.

A sixth migration,
`prisma/migrations/20260817090000_add_customer_entity/migration.sql`,
reinstates the `Customer` entity (see design decision #12) and is
hand-authored for the same reason as the `approvedAt` backfill: Prisma's
diff engine cannot add a required column to a non-empty table on its own.
It creates `customers`, seeds one row per distinct existing
`Project.customerName` value plus a fallback "Unassigned" row, backfills
every `Project.customerId` by matching (trimmed) name, then sets the column
`NOT NULL` and drops the old `customerName` column. Distinct customer names
that only differ by casing (e.g. "Acme Corp" vs "ACME Corp.") are **not**
merged automatically — check the new Customers page after running this and
consolidate any duplicates by hand.

## Common commands

| Command                                               | Purpose                                            |
| ----------------------------------------------------- | -------------------------------------------------- |
| `npx prisma studio`                                 | Browse/edit the shared Neon data in a local GUI    |
| `docker compose -f docker/docker-compose.yml up -d` | (optional) start a local disposable Postgres + pgAdmin instead |
| `npx prisma format`                                 | Format and lint-check`schema.prisma`             |
| `npx prisma validate`                               | Validate the schema without touching the DB        |
| `npx prisma migrate dev --name <name>`              | Create + apply a new migration (dev)               |
| `npx prisma migrate deploy`                         | Apply pending migrations (CI/staging/prod)         |
| `npx prisma migrate status`                         | Show which migrations are applied/pending          |
| `npx prisma generate`                               | Regenerate the Prisma Client after a schema change |
| `npx nx serve ipm-be`                               | Run the NestJS API locally                         |
