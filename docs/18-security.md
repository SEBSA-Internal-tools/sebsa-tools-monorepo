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

**NestJS implementation (2026-10-08).** `apps/api/src/modules/password-links`
implements this contract and `password-links.service.spec.ts` runs the mock's
cases against it.

- Tokens: 32 random bytes, base64url; only `SHA-256(token)` is stored
  (`password_links.token_hash`). Consumption is a conditional update, so two
  concurrent submits cannot both use one link.
- Email goes through the `Mailer` port (`apps/api/src/integrations/mail`). The
  development adapter, `DevOutboxMailer`, logs each link as `[dev outbox] …`.
  Outside development it refuses to send, and the link is recorded as
  `email_status = FAILED` rather than being written to production logs. Bind
  the real transport in `MailModule` when it is available.
- Rate limits: per token (`failed_attempts`, 5), per email (3 per 15 min), per
  resend (60 s, from the last link's `created_at`), plus 30 requests per 15 min
  per IP. The per-email and per-IP counters are in memory
  (`RateLimiterService`): correct for one API instance; move them to Redis
  before running more than one.
- Per-IP limits need Express `trust proxy` set to the real proxy depth behind
  a load balancer, or every caller shares the balancer's address.
- The four public routes are exempt from the CSRF cookie check (they send no
  cookies) and instead check `Origin` against `FRONTEND_ORIGIN`, with
  `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.
- Setting a password revokes every `RefreshSession` for the user.
- Public self-registration (`POST /auth/register`) was removed: accounts are
  created only by an admin invite.

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

The API sets these itself (helmet, below); the host that serves the web build should send the same for the HTML:

| Header                      | Value                                                  |
| --------------------------- | ------------------------------------------------------ |
| `Content-Security-Policy`   | `default-src 'self'` plus what the app genuinely needs |
| `X-Frame-Options`           | `DENY`                                                 |
| `X-Content-Type-Options`    | `nosniff`                                              |
| `Referrer-Policy`           | `strict-origin-when-cross-origin`                      |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains`                  |

HTTPS everywhere. Session cookies `Secure`, `HttpOnly`, `SameSite=Lax`.

## API hardening (NestJS)

The backend is the only enforcement point ([ADR 0016](./adr/0016-nestjs-is-the-only-backend.md)).

**Sessions**

- `sdp_access` (15-minute JWT) and `sdp_refresh` (rotated on use, scoped to
  `/api/auth`) are `HttpOnly`, `SameSite=Lax`, `Secure` in production. JWTs are
  pinned to HS256 with separate secrets.
- The access token is bound to its server-side session: logout, a password
  change, deactivation, deletion or an email change revokes the session and the
  access token stops working at once (not after 15 minutes).
- CSRF: double-submit token (`sdp_csrf` cookie + `X-CSRF-Token`) on every write;
  only the exact public auth paths are exempt, and those check `Origin`.

**Sign-in**

- 5 attempts per account and 30 per client IP per 15 minutes, then 429.
- Unknown and invited accounts get the same argon2 work as a wrong password, so
  response time does not reveal which emails exist; one generic 401 for all.
- `TRUST_PROXY` must name the real proxy (hop count or addresses) so per-IP
  limits see the client, not the load balancer.

**Accounts**

- Changing a user's email puts the account back to Invited: password cleared,
  every session and link revoked, a new invite sent to the new address. An
  admin cannot point an account at an unverified address and then reset it.
- revoke-invite deletes only a still-INVITED account, inside one transaction.
- Super Admin transfer is refused while the target still holds review work.

**Uploads** (task attachments, review screenshots)

- Checked on the decoded bytes: PNG/JPEG/GIF/WebP by magic number, ≤ 5 MB,
  ≤ 10 per item. Only `data:image/...;base64` is stored, so no `javascript:` or
  remote URL can reach an `<img src>` or download link.
- JSON body limit 1 MB, raised to 8 MB (attachments) / 25 MB (review drafts)
  only on those routes and only with a session cookie; over-limit is 413.

**Responses and data**

- `helmet`: CSP with `frame-ancestors 'none'`, `X-Frame-Options: DENY`,
  `nosniff`, `Referrer-Policy: no-referrer`, HSTS in production; no
  `X-Powered-By`. Swagger is off unless `SWAGGER_ENABLED=true`.
- Error responses carry a code and a safe message only; internals never leak.
- Passwords and refresh tokens are argon2id; link tokens are stored as SHA-256.
- Data at rest is encrypted by the database host (Neon); production requires
  `sslmode=require` on the connection.
- Retired checklist content (`scope=all`, inactive rows) is admin-only.

**Known follow-ups**: the rate limiter is in memory (one instance; use Redis
with several); attachments are stored as data URLs in the database (move to
object storage); forgot-password waits for the email send, which leaks timing
once a real mail transport is bound — queue it with the email work.
