# Security

## The one rule

**The client never decides authorization.**

Route guards, hidden buttons and filtered lists shape the *experience*. They are
not a control. Anyone can open the console, call the endpoint directly, and skip
every one of them.

This is why the mock API enforces permissions server-side even though there is
no server yet:

```ts
const auth = requireRole("reviewer", "admin");
if ("response" in auth) return auth.response;
```

Building it this way means the client's assumptions are already correct when a
real backend arrives. A mock that trusts the caller teaches the codebase a habit
the real system cannot afford.

Every handler that touches protected data calls `requireUser()` or
`requireRole()` first. `currentUser()` returns `null` with no session rather
than defaulting to a user — an unauthenticated request must genuinely fail.

## Authentication

Mock auth today, SSO later. What is deliberate about the current implementation
and should survive the swap:

- **Wrong password and unknown account return the identical message.** Different
  messages turn a login form into an account enumeration oracle.
- **The session is one identity.** No impersonation, no user switcher. Testing
  another role means signing in as that account, which is also how a real
  auditor would want it. See [ADR 0006](./adr/0006-single-identity-no-impersonation.md).
- **Sign-out calls `queryClient.clear()`**, not `invalidateQueries`. The next
  user must never see a flash of the previous user's cached data.
- **Nothing sensitive is in `localStorage`.** It holds a user id and UI
  preferences. When real tokens exist they belong in httpOnly cookies —
  `localStorage` is readable by any script on the page, which makes one XSS into
  a full account compromise.

## Input

**Validate at the boundary, in both directions.** Zod parses every response
before it reaches a component, and every request body before the mock acts on
it. Validation on the client is for user experience; the server validates again
because the client's copy can be bypassed.

**Never `dangerouslySetInnerHTML`.** React escapes by default; the only way to
introduce an XSS here is to opt out. If rich text ever becomes a requirement,
sanitise with a maintained library on the way in and record the decision as an
ADR.

**URL parameters are user input.** `routePaths` builders call
`encodeURIComponent` on every argument.

## Output

- No secrets in the bundle. `VITE_*` variables are compiled into client code and
  are public by definition. An API key in one is a published API key.
- No sensitive data in logs. `logger.ts` is the one boundary; it must never
  receive a token, a password or a full user record.
- Error messages tell the user what to do, not what the stack was. Details go to
  the console in development and to the logger in production.

## Dependencies

`npm audit` on every dependency addition, and in CI. A high or critical advisory
in a runtime dependency blocks a merge; a moderate one gets an issue and a date.

Every dependency is a supply-chain surface, which is the strongest argument in
[dependency governance](./15-dependency-governance.md) for keeping the list
short.

## Headers, for deployment

Configured at the host, not in the app:

| Header | Value |
| --- | --- |
| `Content-Security-Policy` | `default-src 'self'` plus what the app genuinely needs |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` |

HTTPS everywhere. Session cookies `Secure`, `HttpOnly`, `SameSite=Lax`.

## When the real backend arrives

1. Set `VITE_API_MODE=live` and the base URL.
2. Replace the mock session with the real auth flow. The client already assumes
   nothing.
3. Confirm every permission the mock enforces is enforced there — the handlers
   are a readable specification of what must be true.
4. Move tokens to httpOnly cookies and add CSRF protection for state-changing
   requests.
