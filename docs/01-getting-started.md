# Getting started

## What this is

The Service Delivery Portal is a single frontend hosting three sub-applications:
**Code Review** (built), **Delivery** and **Wiki** (registered shells, later
phases). The Code Review Portal replaces a spreadsheet-and-document review
process with role-based workspaces, a task-type-driven quality checklist and
structured reviewer feedback.

## Prerequisites

| Tool    | Version         | Why                                                               |
| ------- | --------------- | ----------------------------------------------------------------- |
| Node.js | **22 or newer** | Vite 8 requires it. Older versions fail with a cryptic ESM error. |
| npm     | 10+             | Ships with Node 22. The repo uses npm workspaces.                 |

Check with `node --version`. If you use `nvm`, run `nvm use 22`.

## Setup

```bash
git clone <repository-url>
cd FE_Repo_SDP
npm install
npm run dev
```

Open <http://localhost:5173>. You will land on the login screen.

**There is no `.env` to create and no backend to run.** Every value has a safe
default and the app boots against a seeded mock API. See [Mock API](./16-mock-api.md).

### Signing in

Any seeded account works with the shared demo password:

| Email                                    | Roles                      | Use it to see               |
| ---------------------------------------- | -------------------------- | --------------------------- |
| `charith.widanapathirana@sebsaworld.com` | Developer, Reviewer, Admin | All three workspaces        |
| `dheliya.kankanamge@sebsaworld.com`      | Developer                  | One workspace               |
| `pinsara.chandika@sebsaworld.com`        | Reviewer                   | The reviewer workspace only |

Password for all of them: `Sebsa@2026` (shown on the login screen).

Signing in as different accounts is how you check role gating — there is no
account switcher in the app, deliberately. See
[ADR 0013](./adr/0013-single-identity-no-impersonation.md).

## Scripts

| Script                            | What it does                                       | When you run it           |
| --------------------------------- | -------------------------------------------------- | ------------------------- |
| `npm run dev`                     | Dev server with the mock API                       | Daily                     |
| `npm run build`                   | Type-check the workspace, then build               | Before pushing            |
| `npm run preview`                 | Serve the production build                         | Checking a build locally  |
| `npm run typecheck`               | `tsc -b` across app and packages                   | Daily                     |
| `npm run lint` / `lint:fix`       | ESLint, including the architecture rules           | Daily                     |
| `npm run format` / `format:check` | Prettier                                           | Before committing         |
| `npm test`                        | Unit and component tests                           | Daily                     |
| `npm run test:watch`              | The same, in watch mode                            | While writing tests       |
| `npm run test:coverage`           | With coverage; `domain/` is held to 90%            | Before a large merge      |
| `npm run test:storybook`          | Every story in Chromium, with accessibility checks | Before pushing UI changes |
| `npm run test:e2e`                | Playwright end-to-end                              | Before pushing            |
| `npm run storybook`               | Component workshop on :6006                        | Building components       |

First run of `test:storybook` or `test:e2e` needs browsers:

```bash
npx playwright install chromium
```

## Environment

| Variable               | Default                          | Purpose                                           |
| ---------------------- | -------------------------------- | ------------------------------------------------- |
| `VITE_API_MODE`        | `mock` in dev, `live` in a build | `mock` boots MSW in the browser                   |
| `VITE_API_BASE_URL`    | `/api`                           | Prefixed to every request                         |
| `VITE_APP_NAME`        | SEBSA Service Delivery Portal    |                                                   |
| `VITE_ENABLE_DEVTOOLS` | on in dev                        | React Query devtools and the mock console helpers |

Copy `.env.example` to `.env.local` if you need to change any of them. The
production default is `live` on purpose: shipping seeded fixtures to a real
deployment because someone forgot a variable is not a failure mode worth having.

## Useful console helpers

Available in development:

```js
window.__resetDb(); // restore the seeded database
window.__mockApi.setUser('u-pinsara'); // act as another seeded user
window.__mockApi.setFailureRate(0.5); // fail half of all requests
```

## Committing

Husky runs `lint-staged` on commit: ESLint with `--fix`, then Prettier. If a
commit is rejected, the message names the rule — fix it rather than passing
`--no-verify`.

Branch from `develop`. CI runs the same gates you have locally, plus the browser
suites.
