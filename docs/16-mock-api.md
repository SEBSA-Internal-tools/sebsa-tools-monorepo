# Mock API

The application runs against a full mock API built on **MSW**, so the frontend
can be developed, demonstrated and tested with no backend at all. The same
handlers serve the browser, the component tests and the Playwright suite —
which is the point: one definition of the API's behaviour, exercised three ways.

## Behaving like a server, not like a stub

The handlers resolve the caller's identity, check permissions, and return
contract-shaped 401 / 403 / 404 / 409 / 422 / 500 responses.

```ts
export function requireRole(...roles: Role[]): { user: User } | { response: Response } {
  const result = requireUser();
  if ('response' in result) return result;
  const permitted = roles.some((role) => result.user.roles.includes(role));
  if (!permitted) {
    return {
      response: fail('forbidden', `This action requires the ${roles.join(' or ')} role.`),
    };
  }
  return result;
}
```

This matters more than it looks. **Authorization is decided here, not in the
UI** — the route guards are convenience for the user. Building the mock this way
means the "never trust client-side authorization" rule is honoured before a real
backend exists, and the day one arrives, nothing about the client's assumptions
has to change.

`currentUser()` returns **null** when nobody is signed in, rather than falling
back to a default user. An unauthenticated request has to actually fail, or
"protected" means nothing.

## Layout

```
src/mocks/
  browser.ts    the worker, started from main.tsx when VITE_API_MODE=mock
  db.ts         the in-memory database, seeded from data/
  handlers.ts   composes every handler module
  handlers/
    _helpers.ts          latency, failure injection, guards, pagination, errors
    authHandlers.ts      session, login, SSO, logout
    taskHandlers.ts  reviewHandlers.ts  checklistHandlers.ts
    adminHandlers.ts  notificationHandlers.ts
  data/
    users.json  customers.json  tasks.json  notifications.json  checklist.seed.json
```

Handlers are ordered and can fall through: returning `undefined` from one passes
the request to the next, which is how a specific `/tasks/mine` route can sit in
front of a generic `/tasks/:id`.

## The seeded database

`db.ts` loads the JSON fixtures into memory at startup. Mutations write to it, so
a session behaves like a real one — create a task and it appears in the list —
and a reload restores the seed.

Fixtures are realistic: SEBSA customers, real-shaped task ids (`AASL-007`),
tasks across every status, and no self-review conflicts. The default user
(`u-charith`) owns seven tasks spanning submitted, draft, changes-requested,
in-review, approved, cancelled and resubmitted, so every state is visible on
first load rather than requiring setup.

## Authentication

| Endpoint                | Behaviour                                                             |
| ----------------------- | --------------------------------------------------------------------- |
| `GET /api/auth/session` | The signed-in user, or 401                                            |
| `POST /api/auth/login`  | Validates email and the shared demo password against the seeded users |
| `POST /api/auth/sso`    | Signs in as the default user                                          |
| `POST /api/auth/logout` | Clears the session                                                    |

A wrong password and an unknown account return the **identical** message. That
is not laziness — distinguishing them turns the login form into an account
enumeration oracle, and the mock should not teach a habit the real one must not
have.

## Demo controls

Available in development:

```js
window.__resetDb(); // restore the seeded state
window.__mockApi.setUser('u-pinsara'); // act as another seeded user
window.__mockApi.setFailureRate(0.5); // fail half of all requests
window.__mockApi.setLatency(2000); // slow everything down
```

The failure-rate control exists so error and retry paths can be _watched_
rather than assumed. Every handler opens with `await simulateLatency()` (120ms),
which makes loading states real rather than theoretical — a skeleton nobody ever
sees is a skeleton nobody ever checks.

## In tests

**Component tests** import `src/test/mswServer.ts`, an `msw/node` server that is
exported but **not** auto-started. A test file opts in. That way an unexpected
network call is an error rather than a silently mocked success.

**Playwright** uses the browser worker, exactly as the app does.
`e2e/fixtures/test.ts` calls `window.__resetDb()` before each spec so tests never
inherit each other's mutations.

## Adding an endpoint

1. Schema in `packages/contracts/src/`.
2. Handler in the right `handlers/` module — open with `await simulateLatency()`,
   then `maybeFail()`, then the guard, then the work.
3. Return through `ok()` / `fail()` / `noContent()` so the shape stays consistent.
4. Seed data if it needs any.

## Going live

Set `VITE_API_MODE=live` and `VITE_API_BASE_URL` to the real API. The worker is
never started, and nothing else changes — components talk to `apiClient` either
way. `live` is the default in a production build, so a forgotten environment
variable cannot ship fixtures.
