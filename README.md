# SEBSA Service Delivery Portal — Frontend

A shell hosting several internal applications. The **Code Review Portal** (spec `SPL/OPS/FO-001`)
is the first; **Delivery** and **Wiki** follow in later phases and are already registered as
navigable shells so the portal registry stays exercised.

```bash
npm install
npm run dev          # http://localhost:5173 — runs against seeded mock data, no backend needed
npm run storybook    # http://localhost:6006 — the design system
```

No `.env` file is required. Development defaults to mock mode; a production build defaults to
`live` so fixtures can never ship by accident.

---

## Scripts

| Script                            | What it does                                                                           |
| --------------------------------- | -------------------------------------------------------------------------------------- |
| `npm run dev`                     | Vite dev server with MSW intercepting `/api/*`                                         |
| `npm run build`                   | Type-check the whole workspace, then build                                             |
| `npm run typecheck`               | `tsc -b` across the app and all three packages                                         |
| `npm run lint` / `lint:fix`       | ESLint flat config, including the architectural boundary rules                         |
| `npm run format` / `format:check` | Prettier                                                                               |
| `npm test`                        | Unit and component tests (jsdom)                                                       |
| `npm run test:coverage`           | Same, with coverage — `**/domain/**` is held to 90%                                    |
| `npm run test:storybook`          | Every story rendered in Chromium, with accessibility checks that **fail** on violation |
| `npm run test:e2e`                | Playwright                                                                             |
| `npm run storybook`               | Component workshop                                                                     |

`window.__resetDb()` restores the seeded mock database from the browser console.

---

## Layout

```
packages/
  contracts/   @sdp/contracts — Zod schemas for everything crossing the network
  types/       @sdp/types     — the type-only face of contracts (zero runtime)
  ui/          @sdp/ui        — the portal-agnostic design system
src/
  app/         router, providers, root layout, portal registry
  portals/
    code-review/
      domain/          rules used by three or more features (status machine, permissions)
      features/<name>/ api · components · domain · hooks · routes
    delivery/  wiki/   Phase 2 and 3 shells
  shared/      app-aware cross-portal compositions
  components/ui/ staging area for primitives whose API is still moving
  lib/         apiClient, queryClient, queryKeys, formatters, storage, logger, cn
  config/      routes, statusConfig, constants, featureFlags, env, navConfig
  content/     every user-facing string, as JSON
  mocks/       MSW handlers, seeded database, fixture data
  services/    mockApiService — demo and test controls for the mock backend
```

---

## The rules that matter

### Three component tiers

The distinction is **what a component is allowed to know**, and it is enforced by ESLint rather
than by convention.

| Tier            | Lives in            | May import                            | Example                                       |
| --------------- | ------------------- | ------------------------------------- | --------------------------------------------- |
| Design system   | `packages/ui`       | react, radix, cva, lucide             | `Button`, `SegmentedRadioGroup`, `DonutChart` |
| Staging         | `src/components/ui` | tier 1                                | a primitive still finding its API             |
| App composition | `src/shared`        | tiers 1–2, `config`, `lib`, `content` | `StatusBadge`, `AppBar`, `PageHeader`         |

`packages/ui` may not import `@/…` or `@sdp/contracts`. That is why `StatusBadge` — which reads
`config/statusConfig` — lives in `src/shared` and not beside `Badge`. Delivery and Wiki adopt tier 1
unchanged; they will write their own tier 3.

### `domain/` is React-free, and lint enforces it

Business rules live in `domain/` folders that may not import React, TanStack Query, or anything
under `components/`. That restriction is the whole reason the folder exists: it is what makes the
tricky rules — checklist composition, review-cycle counting, rank gating, self-review exclusion —
testable without rendering anything.

`checklistModel.test.ts` pins the seeded composition (Customization 23 questions, Configuration 8,
Lobby 8, Quick Report 9, Upgrade Service 10) against the real seed file, so an edit that changes a
task type's question count fails the build.

### Contracts are the single source of truth

`@sdp/contracts` describes what crosses the network. `lib/apiClient` validates responses against it
and the MSW handlers validate requests against it, so contract drift fails loudly in development
rather than shipping. Form schemas live in the owning feature's `domain/` and are built by
`.pick()`/`.extend()` from a contract — never by redeclaring the shape.

### Authorization is decided by the server, even in mock mode

The MSW handlers check roles and ownership and return real 401/403/409 responses. Self-review
exclusion, concurrent task pick, and admin-only deletion are enforced there. The UI's role gating
shapes what a user sees; it does not secure anything.

### Strings live in `src/content`

Every user-facing string is JSON, so the specification's exact error wording can be asserted in
tests rather than retyped into JSX — and so adopting i18n later is a change to one file.

### Colour is computed, not chosen

The categorical chart palette in `src/index.css` was validated for lightness band, chroma floor,
colourblind separation and contrast. The obvious choice — reusing the violet and blue semantic
tokens — puts those two hues 0.4 ΔE apart under deuteranopia. Every chart also carries a legend with
counts and percentages, so colour is never the sole encoding.

Storybook runs accessibility checks at `error` severity. Several contrast failures in this codebase
were found that way, not by inspection: white on `success-500` is 3.3:1, white on `warning-500` is
2.2:1, and dimming tinted text with `opacity` pushed every feedback tone below 4.5:1.

---

## Environment

| Variable               | Default                          | Purpose                                    |
| ---------------------- | -------------------------------- | ------------------------------------------ |
| `VITE_API_MODE`        | `mock` in dev, `live` in a build | `mock` boots MSW in the browser            |
| `VITE_API_BASE_URL`    | `/api`                           | Prefixed to every `apiClient` request      |
| `VITE_APP_NAME`        | SEBSA Service Delivery Portal    |                                            |
| `VITE_ENABLE_DEVTOOLS` | on in dev                        | React Query devtools and the user switcher |

See `.env.example`. Node 22 or newer is required (Vite 8).

---

## Working on it

Adding a portal: write a `manifest.ts`, add it to `allManifests` in `src/app/router.tsx`. The shell
needs no other change.

Adding a feature: create `features/<name>/{api,components,domain,hooks,routes}`. Put the rules in
`domain/` first and test them there; the components that follow become thin.

Adding a component: start in `src/components/ui`. Promote it to `packages/ui` once a second portal
needs it, or once it appears in the Figma component sheets.
