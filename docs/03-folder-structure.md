# Folder structure

## Repository root

```
FE_Repo_SDP/
  .github/workflows/    CI
  .husky/               pre-commit hook (lint-staged)
  .storybook/           Storybook config and global decorators
  docs/                 this documentation
  e2e/                  Playwright specs
  packages/             workspace packages — contracts and types
  public/               static assets, including the MSW service worker
  src/                  the application
  Figma UI Wireframes/  design source of truth (reference, not built)
```

## `packages/` — two workspace packages

| Package | Import as | Holds |
| --- | --- | --- |
| `@sdp/contracts` | `@sdp/contracts` | Zod schemas for every API payload, plus the types inferred from them |
| `@sdp/types` | `@sdp/types` | Types with no runtime counterpart (utility and view-model types) |

They stayed as packages rather than folding into `src/` because they are the
contract between this frontend and the API — the one part of the repo a second
consumer (a BFF, a shared test kit, the Delivery portal if it ever splits out)
would take as a unit. Component code moved to `src/components` because it is
this application's UI, not a shared library.
See [ADR 0001](./adr/0001-workspace-packages-and-ui-tier.md).

## `src/`

```
src/
  app/          App.tsx, providers.tsx, ErrorBoundary.tsx — composition root
  components/
    ui/         portal-agnostic design system (22 folders)
    common/     app-aware compositions (app bar, page header, user menu, …)
  config/       env.ts, featureFlags.ts — the only files reading import.meta.env
  constants/    values identical in every environment
  content/      user-facing strings as typed JSON
  lib/          framework-level helpers (api client, query keys, storage, logging)
  mocks/        MSW handlers, seeded database, fixtures
  pages/        screens owned by the shell, not by a portal
  portals/      the three sub-applications
  routes/       every route definition in the app
  services/     imperative service objects used outside React
  stores/       Zustand stores
  styles/       all CSS
  test/         test infrastructure (not tests)
  types/        app-local types
  main.tsx      entry point
```

### `constants/` vs `config/`

The distinction is mechanical, not stylistic.

| | `constants/` | `config/` |
| --- | --- | --- |
| Contents | Values identical in every environment | Values that come from the environment |
| Reads `import.meta.env` | Never | Always |
| Importable from a plain Node script | Yes | No |
| Files | `routePaths`, `app`, `status`, `navigation`, `portals`, `roles`, `session` | `env`, `featureFlags` |

Merging them would make `constants/` untestable outside a bundler, which matters
because `routePaths.ts` is walked by a test.

Constants are `.ts`, not `.js`: `allowJs` is off, so a `.js` file would sit
outside `tsc -b` entirely, and `as const` narrowing would be lost — `statusConfig[task.status]`
would degrade from an exhaustively-checked `Record<TaskStatus, …>` to an untyped
lookup, forfeiting the compile error that fires today when a status is added.
User-facing **strings** are `.json` under `src/content/`, which is the shape a
translation pipeline can consume.

### `content/` — strings live outside components

Every user-visible string is in a JSON file, imported through `src/content/index.ts`.
No literal copy in a component.

```tsx
import { content } from "@/content";
<h1>{content.home.title}</h1>
```

Two reasons: copy changes stop being code changes, and the day this needs a
second language, there is one place to translate rather than three hundred.

### `lib/` — the framework layer

| File | Responsibility |
| --- | --- |
| `apiClient.ts` | The only place `fetch` is called. Base URL, JSON handling, error normalisation, contract validation |
| `queryClient.ts` | The single QueryClient, its defaults and retry policy |
| `queryKeys.ts` | Every query key, as a factory (`qk.tasks.mine()`) |
| `storage.ts` | Typed, quota-safe `localStorage` access |
| `formatters.ts` | Date and number formatting, one implementation each |
| `logger.ts` | The one logging boundary |

Nothing in `lib/` imports a component or a portal.

### `portals/` — the sub-applications

```
portals/
  code-review/
    domain/       rules shared by three or more features
    features/
      admin/ auth/ checklists/ notifications/ reports/ reviews/ tasks/
        api/ components/ domain/ hooks/ routes/
  delivery/       phase 2 shell
  wiki/           phase 3 shell
```

A feature folder only grows the sub-folders it needs — `checklists/` is
`domain/` only today, because that is all that exists of it.

### `routes/` — route configuration only

```
routes/
  index.tsx             the router tree, and createBrowserRouter
  codeReviewRoutes.tsx  deliveryRoutes.ts  wikiRoutes.ts
  guards.tsx            RequireAuth, RequireRoles
  routeHandle.ts        typed route handles and title resolution
  routeParams.ts        typed useParams
  routes.test.ts        the regression guard
```

Page components stay in their feature's `routes/` folder. `src/routes/` holds
route *configuration* — moving thirty screens here would collapse the feature
architecture, which is not what "all routes in one folder" asks for. What is
centralised is every place a route is *declared*, and every path *string*, which
lives one step further out in `src/constants/routePaths.ts`.

### `styles/`

| File | Contents |
| --- | --- |
| `index.css` | Imports only. Nothing is declared here. |
| `Themes.css` | `@theme` design tokens and the `:root` gradients |
| `base.css` | `@layer base` element defaults |
| `utilities.css` | `@utility` definitions |
| `Pages.css` | Page-level CSS Tailwind cannot express |

`Pages.css` has an admission rule, stated in the file: only `@keyframes`,
selectors utilities cannot reach (`:focus-within` combinations, `::selection`),
or a multi-stop gradient reused in three or more places. Everything else is a
utility class on the element.

## Configuration files

| File | Purpose |
| --- | --- |
| `vite.config.ts` | Build config and the `@`/`@sdp/*` aliases |
| `vitest.config.ts` | Merges the Vite config; defines the `unit` and `storybook` projects |
| `tsconfig.json` | Project references only |
| `tsconfig.app.json` | The strict app config |
| `tsconfig.node.json` | Config files, which run in Node |
| `eslint.config.js` | Correctness rules **and the architectural zones** |
| `playwright.config.ts` | e2e config; starts the dev server itself |
| `.prettierrc` | Formatting; `tailwindStylesheet` points at `src/styles/index.css` |

## Path aliases

| Alias | Resolves to |
| --- | --- |
| `@/…` | `src/…` |
| `@sdp/contracts` | `packages/contracts/src` |
| `@sdp/types` | `packages/types/src` |

Declared in both `vite.config.ts` and `tsconfig.app.json` — they must be changed
together. There is no `baseUrl`: it is deprecated in TypeScript 6, so `paths`
targets are `./`-relative.
