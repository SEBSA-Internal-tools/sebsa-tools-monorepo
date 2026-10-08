# Security

## The one rule

**The client never decides authorization.**

Route guards, hidden buttons and filtered lists shape the _experience_. They are
not a control. Anyone can open the console, call the endpoint directly, and skip
every one of them.

This is why the mock API enforces permissions server-side even though there is
no server yet:

```ts
const auth = requireRole('reviewer', 'admin');
if ('response' in auth) return auth.response;
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
  auditor would want it. See [ADR 0013](./adr/0013-single-identity-no-impersonation.md).
- **Sign-out calls `queryClient.clear()`**, not `invalidateQueries`. The next
  user must never see a flash of the previous user's cached data.
- **Nothing sensitive is in `localStorage`.** It holds a user id and UI
  preferences. When real tokens exist they belong in httpOnly cookies —
  `localStorage` is readable by any script on the page, which makes one XSS into
  a full account compromise.

## Password links (temporary local auth)

Until SSO, an admin creates an account and the user sets their own password
through a one-time emailed link (`/set-password#token=...`). Forgot password
uses the same link. The screens are public, with no env flag. `RequireGuest`
keeps signed-in users out, but that only shapes the experience: **the token is
the only credential, and the server is the only control.**

`apps/web/src/mocks/passwordLinks.ts` implements this contract and
`passwordLinks.test.ts` asserts it. NestJS must pass the same cases.

**Tokens**

- At least 256 bits from a CSPRNG, URL-safe. Store only `SHA-256(token)`, so a
  database dump or a log line cannot be replayed.
- Single use. Expiry: invite 24 h, reset 60 min. Issuing a link revokes that
  user's earlier links for the same purpose. Setting a password revokes every
  link they hold and **ends every existing session** (`RefreshSession`).
- A link is valid only while the account is in the state it was issued for:
  INVITED for an invite, active for a reset. Deactivating an account revokes
  its links.
- The fragment never reaches the server or access logs. The client sends the
  token only in a JSON body, scrubs it from the address bar, and keeps it in
  memory, never in storage. Ignore token lengths above 256 before hashing.

**No account enumeration**

- `POST /auth/forgot-password` and `POST /auth/resend-link` always answer
  `202` with no body, whether or not the email or token exists.
- `POST /auth/token/validate` returns only `valid` (masked `emailHint`),
  `expired` or `invalid`. It never says whether the account exists, and it
  never consumes the token.
- Login keeps one message for every failure. An INVITED account with no
  password cannot sign in.

**Rate limits** (429 `RATE_LIMITED`)

| Endpoint                   | Limit in the mock          | Also add in NestJS |
| -------------------------- | -------------------------- | ------------------ |
| set-password               | 5 rejected tries per token | per IP             |
| forgot-password            | 3 per email per 15 min     | per IP             |
| resend-link, resend-invite | 60 s per user and purpose  | per IP             |

Count forgot-password per address even when it has no account, or the limit
itself becomes an enumeration oracle. Per-IP limits rely on `trust proxy` being
set correctly behind the load balancer, and on a patched `proxy-addr`: today's
`npm audit` reports an IP-spoofing advisory against it.

**Password policy.** Enforced server-side with the rules in
`features/local-auth/domain/passwordRules.ts`. Answers `PASSWORD_POLICY` with
`failedRules`, or `PASSWORD_PERSONAL` for a password containing the user's name
or email, or a common one. Add a breached-password check (k-anonymity range
query). Hash with Argon2id or bcrypt. Never trim, log or echo the password.

**Admin actions**

- `POST /users` creates the account INVITED and sends the invite. An admin never
  types a password.
- `POST /users/:id/resend-invite` and `POST /users/:id/revoke-invite` use the
  same authorisation as editing: only a Super Admin may act on an Admin or
  Super Admin invite. Both answer `409 NOT_INVITED` once the user has left that
  state.
- Revoking an invite removes the never-activated account and records
  `InviteRevoked` in the system audit log.
- Activating an INVITED user directly is refused (`409 INVITE_PENDING`).

**Transport and headers on these endpoints:** `Cache-Control: no-store`,
`Referrer-Policy: no-referrer`, and an `Origin` check on the public POSTs. The
client also adds `<meta name="referrer" content="no-referrer">` while a
password screen is open.

**Redirects.** After sign-in, only a same-origin path from router state is
followed (`lib/safeRedirect.ts`). `//host`, `/\host`, absolute URLs and control
characters fall back to `/crp`.

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

| Header                      | Value                                                  |
| --------------------------- | ------------------------------------------------------ |
| `Content-Security-Policy`   | `default-src 'self'` plus what the app genuinely needs |
| `X-Frame-Options`           | `DENY`                                                 |
| `X-Content-Type-Options`    | `nosniff`                                              |
| `Referrer-Policy`           | `strict-origin-when-cross-origin`                      |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains`                  |

HTTPS everywhere. Session cookies `Secure`, `HttpOnly`, `SameSite=Lax`.

## When the real backend arrives

1. Set `VITE_API_MODE=live` and the base URL.
2. Replace the mock session with the real auth flow. The client already assumes
   nothing.
3. Confirm every permission the mock enforces is enforced there — the handlers
   are a readable specification of what must be true.
4. Move tokens to httpOnly cookies and add CSRF protection for state-changing
   requests.
