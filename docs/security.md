# Security

What is in place, what is not, and what must be true before production traffic.
Written against the code as it stands — anything unimplemented is listed as a gap
rather than described as if it were done.

Last reviewed: 2026-09-10.

---

## Authentication

JWT bearer tokens, HS256, signed with `JWT_SECRET` and expiring after
`JWT_EXPIRES_IN` (8h). `JwtAuthGuard` re-reads the user from the database on
every request instead of trusting the token payload, so deactivating or
soft-deleting an account takes effect immediately rather than at token expiry.

Passwords are hashed with bcrypt at cost factor 12 (`auth/password.ts`, the
single source for that number). A hash written at a lower cost is transparently
re-hashed on the owner's next successful login, so raising the factor does not
strand existing accounts. Self-registration is restricted to the domains
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

## Hardening in place

### Transport and response headers

`helmet` runs on every API response. In production that includes HSTS
(`max-age=31536000; includeSubDomains; preload`) and a `default-src 'self'` CSP;
outside production CSP is off so Swagger UI keeps working.

**The CSP that matters most for XSS is not this one.** helmet here protects API
responses. The Angular app's `index.html` is served by whatever hosts the static
build, and the CSP on *that* response is what constrains scripts in the browser.
Set it at the static host or the reverse proxy — `script-src 'self'` at minimum.

### API documentation

Swagger is mounted only when `NODE_ENV !== 'production'`. A browsable map of
every endpoint and DTO is free reconnaissance and does not belong on a public
host.

### Rate limiting

`ThrottlerGuard` is registered globally at 100 requests per minute per IP.
`POST /api/auth/login` and `POST /api/auth/register` are tightened to 5 per
minute, which leaves room for a mistyped password but not for credential
stuffing.

`TRUST_PROXY` must be set to `"true"` when the app runs behind a load balancer,
or every request appears to come from the proxy and one bucket covers all users.
It defaults to `false`: trusting `X-Forwarded-For` without a proxy in front lets
a client spoof the header and bypass the limiter entirely.

Application throttling does not stop volumetric DDoS — by then the traffic has
already cost you bandwidth. That belongs at the CDN/WAF or load balancer.

### Secret hygiene

`JWT_SECRET` must be at least 32 characters, and in production Joi rejects the
shipped placeholder by value — a length check alone accepted it, since the
placeholder is 34 characters long. The app refuses to boot rather than running
with a known secret.

---

## Open gaps

### 1. JWT stored in `localStorage`

Readable by any script on the origin, so a single XSS becomes full account
takeover. There is no XSS vector in the code today, which is what makes this
tolerable rather than safe.

The stronger pattern is an httpOnly, `Secure`, `SameSite=Strict` refresh cookie
with a short-lived in-memory access token. That reintroduces CSRF, so it needs
CSRF tokens at the same time. It touches token issuance, the auth interceptor,
`AuthService` and CORS credentials — deliberately deferred until after release
rather than changed days before it.

### 2. Production secrets not yet rotated

The code now refuses the placeholder, but real values still need generating and
storing:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Also rotate the Jira API token and the Neon database password, and move
production values into the host's secret store rather than a file. Changing
`JWT_SECRET` invalidates every issued token, so do it at deploy, not mid-day.

### 3. Dependency vulnerabilities

`npm audit --omit=dev` reports 16 production advisories. Assessed 2026-09-10:

- **axios** — upgraded to 1.20.0, clearing ten advisories including prototype
  pollution and two DoS paths.
- **@angular/\*** — two high advisories, neither reachable here: the i18n XSS
  needs Angular i18n (not used) and the `HttpTransferCache` poisoning needs
  SSR/hydration (not used). A patch bump to 21.2.23 closes both and is safe to
  take when there is time to regression-test the UI.
- **@nestjs/\***, **prisma**, **multer** — npm's only "fix" is a major
  *downgrade*, which would be worse than the advisory. Leave them.

### 4. No automated security checking in CI

`bitbucket-pipelines.yml` is still a placeholder and there are no GitHub
workflows, so nothing runs `npm audit`, dependency scanning, or lint on a pull
request. Every check in this document is currently manual.

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
