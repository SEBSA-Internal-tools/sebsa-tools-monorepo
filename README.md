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

## Running the Applications

Install dependencies

```bash
npm install
```

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

## Repository Guidelines

- Use feature branches.
- Follow Nx project boundaries.
- Share reusable code through `libs`.