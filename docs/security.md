# Security

What is in place, what is not, and what must be true before production traffic.
Written against the code as it stands — anything unimplemented is listed as a gap
rather than described as if it were done.

Last reviewed: 2026-09-09.

---

## Authentication

JWT bearer tokens, HS256, signed with `JWT_SECRET` and expiring after
`JWT_EXPIRES_IN` (8h). `JwtAuthGuard` re-reads the user from the database on
every request instead of trusting the token payload, so deactivating or
soft-deleting an account takes effect immediately rather than at token expiry.

Passwords are hashed with bcrypt. Self-registration is restricted to the domains
in `SIGNUP_ALLOWED_EMAIL_DOMAINS`, and a registered account cannot log in until
an admin sets `approvedAt` — `isActive` is a separate switch for disabling an
already-approved account.

## Authorization

Two layers, both enforced server-side:

- **System roles** (`SUPER_ADMIN`, `ADMIN`, `EXECUTIVE`, `REGULAR_USER`) via
  `@Roles()` + `RolesGuard`.
- **Per-project membership** with a privilege group, checked in each service
  (`assertVisible`, `assertCanEdit`, `assertCanComment`, …).

Angular route guards exist but are **convenience only** — they stop a user
loading a page that would fail. The API is the boundary. The audit log is gated
at the controller class level (`@Roles('SUPER_ADMIN')` on `AuditLogsController`)
so a route added there cannot accidentally skip the check.

## Injection

**SQL injection:** every query goes through Prisma's parameterised client. There
is no `$queryRaw` or `$executeRaw` anywhere in the codebase — keep it that way,
and if raw SQL ever becomes necessary use the tagged-template form, never string
concatenation.

**Input validation:** a global `ValidationPipe` runs with `whitelist: true` and
`forbidNonWhitelisted: true`, so unknown properties are rejected rather than
silently passed to Prisma. Every route parameter that is an id uses
`ParseUUIDPipe`.

**XSS:** all user-generated text renders through Angular interpolation, which
escapes by default. There is no `innerHTML`, no `bypassSecurityTrust*`, and no
`DomSanitizer` usage in the application. Comment bodies are stored as plain text
and rendered with `{{ }}` plus `white-space: pre-wrap` for line breaks —
deliberately not as markdown or HTML.

**CSRF:** the token travels in an `Authorization` header, not a cookie, so a
cross-site form post cannot carry credentials. This holds only while the app
does not move to cookie-based sessions; if it ever does, CSRF tokens become
mandatory.

## Data exposure

Activity feeds and comment threads resolve the owning project and apply the same
visibility rule as the entity itself, so neither can leak content from a project
the caller cannot open. Comment mentions silently drop user ids that are not
active members of the project, so the mention field cannot be used to probe for
users outside it.

---

## Open gaps

These are real and unaddressed. Each needs a decision before go-live.

### 1. No security headers (`helmet` not installed)

The API returns no `Content-Security-Policy`, `Strict-Transport-Security`,
`X-Content-Type-Options` or `Referrer-Policy`. Fix: `npm i helmet` and
`app.use(helmet())` in `main.ts`. Requires a dependency, so it has not been
added unilaterally.

### 2. No rate limiting — brute force and DDoS

Nothing throttles `POST /api/auth/login`, so password guessing is unbounded, and
no endpoint has a request ceiling. Fix: `@nestjs/throttler` with a strict limit
on the auth routes and a global default elsewhere. Application-level throttling
does not stop volumetric DDoS — that belongs at the CDN/WAF or load balancer,
which is a hosting decision.

### 3. JWT stored in `localStorage`

Readable by any script on the origin, so a single XSS becomes full account
takeover. There is no XSS vector in the code today, which is what makes this
tolerable rather than safe. The stronger pattern is an httpOnly, `Secure`,
`SameSite=Strict` refresh cookie with a short-lived in-memory access token —
that change also reintroduces the CSRF requirement noted above.

### 4. bcrypt cost factor is 10

`auth.service.ts` hashes at 10 rounds. Current OWASP guidance is 12 or higher.
Raising it affects new hashes only; existing users would need a rehash-on-login
path.

### 5. Secrets

`.env` is gitignored and no secret has ever been committed (verified with
`git log -S`). But `JWT_SECRET` is still the placeholder
`change-me-to-a-long-random-string`, and the live Jira API token and database
password sit in plaintext on developer machines. Before go-live: generate a
strong `JWT_SECRET`, rotate the Jira token and database password, and move
production values into the host's secret store rather than a file.

### 6. Transport

TLS is terminated by the host, not the application. Confirm HTTPS is enforced
with HTTP redirected, HSTS is set (comes with helmet), and `CORS_ORIGIN` is
pinned to the exact production origin rather than a wildcard.

### 7. No automated security checking in CI

`bitbucket-pipelines.yml` is still a placeholder and there are no GitHub
workflows, so nothing runs `npm audit`, dependency scanning, or the lint suite
on a pull request.

---

## Rules for new code

1. Never build a query by string concatenation. Prisma's client only.
2. Never render user input with `innerHTML` or `bypassSecurityTrust*`.
3. Every new endpoint gets `JwtAuthGuard` plus an explicit project-visibility or
   role check. "It's only reachable from an admin screen" is not a control.
4. Validate every DTO field — type, and a length or size bound on anything
   free-form.
5. Never log secrets, tokens, or password hashes.
6. When a feature adds a new way to reference users or projects, confirm it
   cannot be used to enumerate ones the caller cannot already see.
