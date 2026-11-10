# SEBSA Project Management Tool

## Overview

SEBSA Project Management Tool is a full-stack enterprise application built using the Nx monorepo architecture.

The project consists of:

- Angular frontend
- NestJS backend
- Shared libraries
- Enterprise folder structure

---

## Technology Stack

### Frontend

- Angular
- SCSS
- Jest
- Cypress

### Backend

- NestJS
- TypeScript
- Jest

### Monorepo

- Nx 23

---

## Project Structure

```text
sebsa-pm-tool/
│
├── apps/
│   ├── ipm-fe/
│   ├── ipm-fe-e2e/
│   ├── ipm-be/
│   └── ipm-be-e2e/
│
├── libs/
│
├── docker/
├── scripts/
│
├── nx.json
├── package.json
└── tsconfig.base.json
```

---

## Environment Setup

Follow these steps in order — skipping the Prisma step is the most common
cause of setup failures (`ipm-be` failing to start or build with something
like `Cannot find module '@prisma/client'`).

1. Install dependencies

   ```bash
   npm install
   ```

2. Copy the environment template and fill in real values

   ```bash
   cp .env.example .env
   ```

   The team shares **one Neon Postgres instance** — ask a teammate for the
   `DATABASE_*` credentials rather than creating your own database. Never
   commit `.env` (it's already in `.gitignore`). See
   [docs/database-architecture.md](docs/database-architecture.md) for the
   full setup and workflow reference.

3. Generate the Prisma client

   ```bash
   npx prisma generate
   ```

   `PrismaService` imports directly from `@prisma/client`, which doesn't
   exist in `node_modules` until this command has been run — required after
   `npm install` and again any time `prisma/schema.prisma` changes. You do
   **not** need to run `npx prisma migrate deploy`; the schema already exists
   on the shared database, and migrations are only needed when the schema
   itself changes (see
   [Migration workflow](docs/database-architecture.md#migration-workflow)).

4. (Optional) Seed a test admin user

   ```bash
   npx prisma db seed
   ```

   Prints test login credentials to stdout. Idempotent — safe to re-run.

---

## Running the Applications

Run Frontend

```bash
npx nx serve ipm-fe
```

Run Backend

```bash
npx nx serve ipm-be
```

---

## Build

Frontend

```bash
npx nx build ipm-fe
```

Backend

```bash
npx nx build ipm-be
```

---

## Test

Frontend

```bash
npx nx test ipm-fe
```

Backend

```bash
npx nx test ipm-be
```

---

## Architecture

```
Angular
      │
 REST API
      │
 NestJS
      │
 Business Logic
      │
 Database
```

---

## Future Shared Libraries

```
libs/
├── auth/
├── permissions/
├── shared-models/
├── core/
└── ui/
```

---

## Documentation

| Document | Covers |
| -------- | ------ |
| [docs/database-architecture.md](docs/database-architecture.md) | Schema design, modeling decisions, migration workflow |
| [docs/authentication.md](docs/authentication.md) | Login, JWT handling, roles and guards |
| [docs/permissions.md](docs/permissions.md) | System roles, privilege groups and where they are enforced |
| [docs/soft-deletes.md](docs/soft-deletes.md) | Which records soft-delete, which do not, and why |
| [docs/activity-and-audit-log.md](docs/activity-and-audit-log.md) | Activity feeds and the Super Admin audit trail |
| [docs/comments.md](docs/comments.md) | Comment threads, replies and mentions |
| [docs/jira-integration.md](docs/jira-integration.md) | One-way Jira sync and case linking |
| [docs/security.md](docs/security.md) | Security posture, open gaps, rules for new code |
| [docs/configuration.md](docs/configuration.md) | Configurable types, statuses and priorities |
| [docs/frontend-structure.md](docs/frontend-structure.md) | Angular app layout and conventions |
| [docs/ui-architecture.md](docs/ui-architecture.md) | Design tokens and shared UI patterns |

---

## Repository Guidelines

- Use feature branches.
- Follow Nx project boundaries.
- Share reusable code through `libs`.