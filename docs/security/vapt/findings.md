# SDP VAPT — Findings register

- **Target:** Service Delivery Portal (SDP) — NestJS API (`apps/api`) + React web (`apps/web`)
- **Tested commit:** `bcdb115` on branch `feature-charith` (reference only; nothing was committed)
- **Assessment date:** 2026-10-11
- **Environment:** local throwaway (API `127.0.0.1:3100`, PostgreSQL `127.0.0.1:55432/sdp_e2e`), plus source/config review
- **Baselines:** OWASP ASVS 4.0.3 L2 · WSTG 4.2 · OWASP Top 10 2021 · OWASP API Security Top 10 2023 · CWE · CVSS 3.1

Severity and confidence are assessed separately. "Status" is one of **Confirmed** (reproduced at runtime), **Potential** (code-evident, not runtime-reproduced), or **Informational**.

## Summary table

| ID | Title | Severity | Confidence | Status |
|----|-------|----------|-----------|--------|
| SDP-VAPT-001 | Review approval race creates duplicate approvals (TOCTOU) | Medium | Confirmed | **Remediated** |
| SDP-VAPT-002 | Task submit race creates duplicate submissions (TOCTOU) | Low | Confirmed | Confirmed |
| SDP-VAPT-003 | Cross-task finding-text confirmation oracle | Low | High | Confirmed |
| SDP-VAPT-004 | Account-lockout denial of service via failed logins | Medium | Confirmed | **Remediated** |
| SDP-VAPT-005 | Vulnerable dependencies (proxy-addr critical; prisma chain) | Medium | Medium | Potential (mitigated by deployment config) |
| SDP-VAPT-006 | NUL byte in free-text fields causes HTTP 500 | Low | Confirmed | Confirmed |
| SDP-VAPT-007 | Production source maps shipped; SPA ships no CSP | Low | Confirmed | Confirmed |
| SDP-VAPT-008 | Unbounded list endpoints (no server-side pagination) | Low | Confirmed | Confirmed |
| SDP-VAPT-009 | In-memory, per-process rate limiter | Low | High | Potential (by design) |
| SDP-VAPT-010 | Config hygiene: .gitignore gaps, unvalidated bootstrap vars, local .env in synced folder | Low | High | Informational/Potential |
| SDP-VAPT-011 | No CI, dependency gate, or secret scanning in repo | Low | High | Informational |
| SDP-VAPT-012 | Minor existence oracles (DRAFT review 204 vs 404; notification 404 vs 403) | Info | High | Informational |
| SDP-VAPT-013 | `/health` discloses environment name | Info | Confirmed | Informational |
| SDP-VAPT-014 | e2e suite flaky under parallel execution (test quality) | Info | Confirmed | Informational |

No Critical or High application findings were confirmed. The strongest residual risk is the duplicate-approval race (SDP-VAPT-001) and the dependency chain (SDP-VAPT-005).

---

## SDP-VAPT-001 — Review approval race creates duplicate approvals (TOCTOU)

- **Severity:** Medium · **Confidence:** Confirmed · **Status:** Confirmed
- **CWE:** CWE-362 (Race Condition), CWE-367 (TOCTOU) · **OWASP API:** API6:2023 (Unrestricted Business Flows) · **ASVS:** V11.1.6 (atomic, single-use transactions)
- **CVSS 3.1:** 4.3 — `AV:N/AC:H/PR:L/UI:N/S:U/C:N/I:H/A:N`
- **Component:** `apps/api/src/modules/reviews/reviews.service.ts` — `decide()` (approx. L320–421), `assertAssignedReviewer()` (L892–901), `ensureReviewRoundStarted()` (L582–605)

**Preconditions / affected roles:** the task's currently-assigned reviewer (or an Admin acting as reviewer), task `IN_REVIEW`.

**Root cause.** `decide()` reads the task status and assigned-reviewer **outside** the transaction (`assertAssignedReviewer`, `assertDecisionAllowed`). Inside the transaction, `ensureReviewRoundStarted` locks the task row `FOR UPDATE` but **re-reads only `current_review_cycle`, not the status**, and `tx.task.update` is unconditional by `id`. Two approvals that both pass the pre-check therefore both commit: the second starts a *new* review round (`reviewRoundToStart`) and writes a second `CodeReviewForm` with `decision = APPROVED`, a second `TASK_APPROVED` audit row, and bumps `currentReviewCycle`.

**Business impact.** A task can carry two "Approved" review forms and two approval audit entries, and its review-cycle count is inflated. This corrupts the quality metrics the portal exists to produce and pollutes the audit trail used for accountability. Notifications are de-duplicated, so the developer is not spammed; the damage is to data integrity, not availability.

**Reproduction (safe, local).** As the assigned reviewer, after `pick` + draft (`rank 1`), fire the approve POST twice concurrently:
```
POST /api/tasks/{id}/review  {decision:"Approved",draft:{rank:1,comments:[]}}   x2 in parallel
```
Observed: both return `200`; `GET /api/tasks/{id}/reviews` returns **2** forms with `decision=APPROVED`; audit shows **2** `TASK_APPROVED` entries (evidence `p5.txt` F8–F10, `p5b.txt` G1–G2). With 3 concurrent, two succeed and the third hits a `409` unique-key conflict.

**Expected vs actual.** Expected: exactly one approval form, one audit row, cycle unchanged. Actual: two of each.

**Remediation.** Make the state transition conditional inside the transaction: re-read `status` under the existing `FOR UPDATE` lock and abort unless it is still `IN_REVIEW` with `currentReviewerId === user.id`; or use a conditional `updateMany({ where: { id, status: IN_REVIEW, currentReviewerId: user.id }, … })` and treat `count !== 1` as a `409`. The same pattern already used for `pick()` (conditional `updateMany`, L1099–1123) is the model.

**Regression test.** `apps/api/test/e2e/security/workflow-integrity.e2e-spec.ts` → `SDP-VAPT-001` (now `it`). It loops concurrent approvals and asserts exactly one `APPROVED` form, one `TASK_APPROVED` audit row, a final `APPROVED` status, and that the losing request gets `409`.

**Remediation status (2026-10-11): Remediated.** In `decide()`, the final task update is now `tx.task.updateMany({ where: { id, status: IN_REVIEW, currentReviewerId: user.id } })`. If no row matches, it throws `INVALID_STATE_TRANSITION` (409), the same response a sequential second decision already got, and the whole transaction rolls back (round bump, form, history, audit). Behaviour of non-concurrent requests is unchanged; the existing workflow e2e suite passes unchanged.

---

## SDP-VAPT-002 — Task submit race creates duplicate submissions (TOCTOU)

- **Severity:** Low · **Confidence:** Confirmed · **Status:** Confirmed
- **CWE:** CWE-362, CWE-367 · **OWASP API:** API6:2023 · **ASVS:** V11.1.6
- **CVSS 3.1:** 3.1 — `AV:N/AC:H/PR:L/UI:N/S:U/C:N/I:L/A:N`
- **Component:** `apps/api/src/modules/review-tasks/review-tasks.service.ts` — `submit()` (L761–897)

**Preconditions / affected roles:** the owning developer, task `DRAFT` or `CHANGES_REQUESTED`.

**Root cause.** `submit()` checks status before the transaction; inside, `tx.task.update` is unconditional by `id` and the submission-version counter is derived from `auditLog.count` within the same racing window. Two concurrent submits both commit.

**Business impact.** Duplicate `TASK_SUBMITTED` status-history and audit rows, and an inflated submission-version number. Integrity/audit noise only; no privilege or availability impact.

**Reproduction.** Create a draft, fire `POST /api/tasks/{id}/submit` twice concurrently → both `200`, two `SUBMITTED` status-history rows (evidence `p5.txt` F6–F7). The race is timing-dependent; over several rounds it reproduces reliably.

**Remediation.** Same conditional-update pattern as SDP-VAPT-001, guarding on the pre-read status.

**Regression test.** `workflow-integrity.e2e-spec.ts` → `SDP-VAPT-002` (`it.fails`, loops rounds).

---

## SDP-VAPT-003 — Cross-task finding-text confirmation oracle

- **Severity:** Low · **Confidence:** High · **Status:** Confirmed
- **CWE:** CWE-639 (Authorization Bypass Through User-Controlled Key), CWE-203 (Observable Discrepancy) · **OWASP API:** API1:2023 (BOLA) · **ASVS:** V4.2.1
- **CVSS 3.1:** 3.5 — `AV:N/AC:H/PR:L/UI:N/S:U/C:L/I:N/A:N`
- **Component:** `apps/api/src/modules/reviews/reviews.service.ts` — `persistDraft()` stored-finding lookup (L750–751) and `assertProtectedCommentUnchanged()` (L91–109)

**Preconditions / affected roles:** any Reviewer with an active review on some task X, who also knows (or can derive) a finding UUID belonging to another task Y.

**Root cause.** When saving a review draft, stored findings are fetched with `where: { OR: [{ reviewFormId: form.id }, { id: { in: incomingIds } }] }` — the second clause is **not scoped to the current task/form**. A reviewer can place task Y's finding UUID into task X's draft; `assertProtectedCommentUnchanged` then returns `403` if the submitted text differs from Y's stored comment text and accepts (`200`) if it matches. Nothing is written to task Y (confirmed unchanged), but the `403`-vs-`200` difference confirms or denies a guess at another task's finding text.

**Business impact.** A reviewer can confirm the wording of review findings on tasks they are not authorised to see, provided they know the finding's UUID. UUIDs are not enumerable and are returned only to authorised viewers, so exploitability is limited (e.g., a reviewer who saw task Y earlier, then lost access). Confidentiality impact is low and bounded.

**Reproduction.** Evidence `p5.txt` F13–F16: wrong text → `403 FORBIDDEN`; correct text → `200`; task Y finding text unchanged.

**Remediation.** Scope the stored-finding lookup to the current form/task: `where: { reviewFormId: form.id }`, and ignore or reject incoming finding IDs that resolve to a different task rather than comparing their text.

**Regression test.** `workflow-integrity.e2e-spec.ts` → `SDP-VAPT-003` (`it.fails`): asserts the status for a wrong vs correct guess is identical.

---

## SDP-VAPT-004 — Account-lockout denial of service via failed logins

- **Severity:** Medium · **Confidence:** Confirmed · **Status:** Confirmed
- **CWE:** CWE-645 (Overly Restrictive Account Lockout) · **OWASP:** A07:2021 · **OWASP API:** API4:2023 (Unrestricted Resource Consumption) · **ASVS:** V2.2.1
- **CVSS 3.1:** 5.3 — `AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L`
- **Component:** `apps/api/src/modules/auth/auth.service.ts` — `login()` L72–87 (`LOGIN_ATTEMPTS_PER_EMAIL = 5`, `LOGIN_WINDOW_MS = 15 min`)

**Preconditions / affected roles:** unauthenticated attacker who knows (or guesses) a victim's email address; affects any account.

**Root cause.** The per-email counter is consumed on every failed attempt *before* the password check. Five wrong attempts in 15 minutes return `429` to **all** subsequent attempts for that email — including the legitimate user with the correct password. The email is normalised (trim + lowercase), so the attacker needs no exact casing.

**Business impact.** An attacker can keep any known user (including Admins/Super Admin) locked out of sign-in indefinitely by spending five wrong attempts per 15-minute window per target. This is a classic trade-off of per-account throttling; the risk is that it has no counter-balancing recovery path (no CAPTCHA step-up, no "correct credentials clear the lock").

**Reproduction.** Evidence `p1.txt` A14–A15: after 5 attacker failures against a seeded account, the victim's correct password returns `429`; a case/space-variant of the email is also `429` (same bucket).

**Remediation.** Keep per-IP throttling as the primary brute-force control; soften per-account lockout so it cannot be weaponised — e.g., only throttle per `(email, IP)` tuples, or add an exponential delay / CAPTCHA instead of a hard 15-minute block, or let a correct password within the window succeed (and then reset the counter). Note the existing design intentionally returns one generic message and constant-time failures (enumeration-safe) — preserve that.

**Regression test.** `apps/api/test/e2e/security/authn.e2e-spec.ts` → `SDP-VAPT-004` (now `it`). After six attacker failures:
- the owner's browser, which holds its device cookie, signs in (200)
- a request with no cookie, a tampered cookie, or another account's cookie still gets 429

Unit tests in `auth.security.spec.ts` cover the same rules.

**Remediation status (2026-10-11): Remediated (OWASP device cookies).** A successful sign-in sets `sdp_device`:
- HttpOnly, `SameSite=Strict`, path `/api/auth/login`, 180 days
- value `nonce.HMAC(email)`, keyed from the refresh secret

A browser presenting a valid cookie for that email uses its own 5-per-15-minute bucket. Everything else uses the per-account bucket exactly as before. Distributed guessing from unknown browsers is still capped, the per-IP limit is unchanged, and a correct password still fails once a bucket is spent.

Residual risk: an attacker can still delay a first sign-in from a brand-new browser. The edge throttling and fail2ban steps in `docs/27-production-hosting-runbook.md` cover that once hosting is set up.

---

## SDP-VAPT-005 — Vulnerable dependencies

- **Severity:** Medium (aggregate) · **Confidence:** Medium · **Status:** Potential
- **CWE:** CWE-1035 / CWE-937 (known-vulnerable components) · **OWASP:** A06:2021 · **OWASP API:** API9/API10
- **Evidence:** `npm-audit.json`, `npm-audit-prod.json`, `osv.json`

**Finding.** `npm audit` reports 34 advisories overall (2 critical, 22 high, 10 moderate); scoped to production dependencies, 9 (1 critical, 6 high, 2 moderate). Manual triage of the production set:

| Package | Advisory | Reachable? | Notes |
|---------|----------|-----------|-------|
| `proxy-addr` (CRITICAL, GHSA-jqcg-44mw-7w3h, IPv4-mapped IPv6 trust-subnet spoofing) | via `express` | Conditional | Only exploitable when `TRUST_PROXY` is set to **subnet addresses**. The app's guidance uses a hop count (`docs/26`), which is not affected, but a subnet-based `TRUST_PROXY` would let a client spoof `X-Forwarded-For` and bypass per-IP rate limits (ties to SDP-VAPT-004/009). Prioritise the upgrade. |
| `multer` (HIGH, DoS) | via `@nestjs/platform-express` | **No** | The app uses no `multer` / `FileInterceptor` / multipart (uploads are JSON data URLs). Not reachable; upgrade opportunistically. |
| `prisma` / `@prisma/config` → `deepmerge-ts`, `source-map-js` | HIGH (DoS) | Build/CLI-time | Reached by the Prisma CLI, not by request handling. Low runtime risk. |
| `fast-uri`, `valibot` (MODERATE) | via `@hookform/resolvers`/`ajv` | Indirect | Low impact. |

The large remaining count is dev-only tooling (`@nx/*`, `vitest`, `storybook`, `handlebars`, `braces`, `axios` under Nx) — not shipped to production, but still supply-chain surface for the build host.

**Business impact.** The only runtime-relevant item with real impact is `proxy-addr`, and only under a specific `TRUST_PROXY` configuration. The rest are either unreachable at runtime or dev/build-time.

**Remediation.** Upgrade the production chain (`@nestjs/platform-express` → ≥12.1.2 pulls a fixed `multer`; `express`/`proxy-addr` to a patched line; `prisma`/`@prisma/client`). Refresh dev tooling via `@nx/*` and `vitest` minor upgrades. Re-run `npm audit --omit=dev` to confirm the production set is clean. Per the completion rules this assessment did **not** apply upgrades.

**Interim mitigation, documented for the hosting phase (not yet applied).** `docs/27-production-hosting-runbook.md` (Phases 7 and 9) has NGINX overwrite `X-Forwarded-For` with the peer address and the API run with `TRUST_PROXY=1`, a hop count. Hop-count mode does not use the `proxy-addr` subnet matching affected by GHSA-jqcg-44mw-7w3h, and a spoofed header never reaches Express. Verified in a local NGINX dry run on 2026-10-11. The upgrade is still recommended.

**Retest.** `npm audit --omit=dev --json` plus `osv-scanner scan source -L package-lock.json`.

---

## SDP-VAPT-006 — NUL byte in free-text fields causes HTTP 500

- **Severity:** Low · **Confidence:** Confirmed · **Status:** Confirmed
- **CWE:** CWE-20 (Improper Input Validation), CWE-74 · **OWASP API:** API8:2023 · **ASVS:** V5.1.3
- **CVSS 3.1:** 3.7 — `AV:N/AC:H/PR:L/UI:N/S:U/C:N/I:N/A:L`
- **Component:** free-text fields that reach PostgreSQL `text` columns, e.g. attachment `fileName` (`review-tasks.service.ts` `addAttachment` L353) and attachment `caption` (`captionAttachment` L390).

**Root cause.** A `\u0000` (NUL) byte in a string field is passed through DTO/ad-hoc checks and reaches a Postgres `text` column, which rejects NUL and raises an error surfaced as a masked `500 INTERNAL_ERROR`. The global exception filter correctly hides internals (no stack trace leaks), but the request is a server error rather than a clean 4xx.

**Business impact.** Low. An authenticated user can provoke a handled 500 on specific write paths. No data exposure (error masked), no persistence, no crash; it signals that control characters are not sanitised at the input boundary, which is a latent input-validation gap across many text fields.

**Reproduction.** Evidence `p6b.txt`: `fileName: "a\u0000b.png"` → `500 INTERNAL_ERROR`; `caption: "c\u0000d"` → `500`. A filename with path-traversal characters but no NUL (`"../../etc/passwd.png"`) is stored verbatim as a harmless DB label (data URLs mean it is never used as a filesystem path), returning `201` — informational only.

**Remediation.** Strip or reject control characters (`\u0000`–`\u001f`) at the DTO boundary for user-supplied text, as `safeRedirectPath` already does for redirect paths.

**Regression test.** `apps/api/test/e2e/security/input-validation.e2e-spec.ts` → `SDP-VAPT-006` (`it.fails`): expects status `< 500`.

---

## SDP-VAPT-007 — Production source maps shipped; SPA ships no CSP

- **Severity:** Low · **Confidence:** Confirmed · **Status:** Confirmed
- **CWE:** CWE-540 (Information in source code), CWE-1021 (missing CSP) · **OWASP:** A05:2021 · **ASVS:** V14.4.3, V14.3.2
- **Component:** `apps/web/vite.config.ts:89` (`sourcemap: true`), `apps/web/index.html` (no CSP/meta)

**Finding.** The production web build emits **124 `.map` files** and 192 `sourceMappingURL` references (evidence `webbuild.log` + bundle scan). If the static host serves `*.map`, the full TypeScript source is reconstructable by any visitor. Separately, `index.html` carries **no** `Content-Security-Policy` or security `<meta>`; the headers in `docs/18-security.md` are applied by the API (helmet) but not by the static host, and no host config (`vercel.json`, `_headers`, nginx) exists in the repo.

**Positive result.** A secret scan of the built bundle found **no** secrets (no Brevo key, DB URL, JWT secret, or `VITE_*` secret). The app exposes no client secrets — this is correct.

**Business impact.** Source-map exposure aids reverse engineering of client logic (low; the client is not the security boundary). Missing CSP removes a defence-in-depth layer against XSS/clickjacking at the HTML origin — mitigated in practice because the app never uses `dangerouslySetInnerHTML` and the API sends `frame-ancestors 'none'`.

**Remediation.** Either disable production source maps (`sourcemap: false`) or upload them to an error-tracking service and block `*.map` at the host. Add the `docs/18-security.md` header set (CSP `default-src 'self'`, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, HSTS) to the static host configuration, and commit that config.

**Retest.** `vite build` then confirm `.map` files are absent or host-blocked; `curl -I` the deployed HTML for CSP/HSTS.

---

## SDP-VAPT-008 — Unbounded list endpoints (no server-side pagination)

- **Severity:** Low · **Confidence:** Confirmed · **Status:** Confirmed
- **CWE:** CWE-770 (Allocation without Limits) · **OWASP API:** API4:2023 · **ASVS:** V12.1
- **Component:** `review-tasks.service.ts` `findAll` returns a cosmetic `pagination` block (L140–150); `/reviews`, `/notifications`, `/users`, `/handovers`, `/customers` return all rows. Only `/audit-logs` paginates (`audit/dto/audit-log-query.dto.ts`, pageSize ≤ 100).

**Root cause.** Most list endpoints query without `take`/`skip`. Attachment GETs return full base64 image payloads inline.

**Business impact.** Low today (small data set; access is correctly authorised, so no data is over-exposed to the wrong role). As data grows, these become a resource-consumption and latency risk, and large base64 attachment lists amplify it.

**Reproduction.** Evidence `p2.txt` B11–B12: `/tasks` returns a fake pagination object; `/users`, `/handovers`, `/reviews` return full sets; `audit-logs?pageSize=100000` and `?page=-1` and `?sortBy=password` are rejected `400` (good — bounded and allow-listed).

**Remediation.** Add real server-side pagination with a capped page size to the list endpoints, and return attachment metadata (not inline base64) in list responses, fetching bytes on demand. Tracks with the documented "move attachments to object storage" follow-up.

---

## SDP-VAPT-009 — In-memory, per-process rate limiter

- **Severity:** Low · **Confidence:** High · **Status:** Potential (documented by design)
- **CWE:** CWE-770 · **OWASP API:** API4:2023 · **ASVS:** V11.1.4
- **Component:** `apps/api/src/common/rate-limiter.service.ts`; `trust proxy` in `app.setup.ts:25`

**Finding.** Login/refresh/password-link throttling is an in-memory sliding window, correct for a single API instance only; with multiple instances the limits are per-process and thus effectively multiplied. Per-IP limits depend on `TRUST_PROXY` being set to the real proxy depth; the default (`false`) behind a proxy collapses all clients to one address. Both are already documented in `docs/18-security.md` as known follow-ups.

**Business impact.** Low while single-instance. On horizontal scale-out, brute-force and email-flood protections weaken. Ties to SDP-VAPT-005 (`proxy-addr`) and SDP-VAPT-004.

**Remediation.** Move counters to a shared store (Redis `INCR`/`EXPIRE`) before running more than one instance; document the required `TRUST_PROXY` value per deployment and validate it at boot (the env schema already forbids `true`).

---

## SDP-VAPT-010 — Config hygiene

- **Severity:** Low · **Confidence:** High · **Status:** Informational / Potential
- **CWE:** CWE-200, CWE-798 (if secrets committed) · **ASVS:** V14.1, V6.4
- **Evidence:** `.gitignore:24-27`, `apps/api/src/config/env.validation.ts`, `apps/api/prisma/seed.ts:75-80`, gitleaks output.

**Findings (three sub-items):**
1. `.gitignore` covers `.env`, `.env-local`, `.env.local`, `.env.*.local` but **not** `.env.production` or `.env.development` — a developer could commit one by accident (`git check-ignore` confirms they are not ignored).
2. `prisma/seed.ts` reads `BOOTSTRAP_SUPER_ADMIN_EMAIL/PASSWORD/NAME`, which are **not** in the env-validation schema, and the seed upsert overwrites the Super Admin password (and sets it ACTIVE) on every run. Operational risk if the seed is run against a populated database.
3. The local `apps/api/.env` (untracked, correctly git-ignored, never committed — gitleaks found a clean 108-commit history) holds real-looking secrets (`SDP_BREVO_API_KEY`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `DATABASE_URL`) and sits in a **OneDrive-synced** folder, so it is likely replicated to cloud storage.

**Business impact.** (1)/(2) are latent process risks. (3) is the important one: if the OneDrive copy is shared or the account is compromised, those live credentials are exposed. **Advisory — rotate the Brevo API key and both JWT secrets, and move the local `.env` out of the synced folder.** Deleting the file is not enough; rotate the credentials.

**Remediation.** Add `.env.production`, `.env.development`, `.env*` (keep `!.env.example`) to `.gitignore`; add the `BOOTSTRAP_SUPER_ADMIN_*` keys to the env schema and guard the seed to not overwrite an existing active account; relocate the dev `.env` outside OneDrive and rotate its secrets.

---

## SDP-VAPT-011 — No CI, dependency gate, or secret scanning in repo

- **Severity:** Low · **Confidence:** High · **Status:** Informational
- **CWE:** CWE-1120 (process) · **OWASP:** A05/A06:2021
- **Finding.** No `.github/workflows`, no `dependabot.yml`, no CodeQL, no `SECURITY.md`, no `.gitleaks`/`.semgrep` config, despite `docs/01-getting-started.md` stating "CI runs the same gates you have locally." `docs/18-security.md` mandates `npm audit` in CI, but there is no CI to run it.
- **Remediation.** Add a CI pipeline (lint, typecheck, unit + e2e, `npm audit --omit=dev`) with SHA-pinned actions and a least-privilege `permissions:` block; enable Dependabot and secret scanning. This would have surfaced SDP-VAPT-005 automatically.

---

## SDP-VAPT-012 — Minor existence oracles

- **Severity:** Informational · **Confidence:** High
- **CWE:** CWE-203
- **Findings.** (a) An Admin GET of a DRAFT task's review returns `204` while a GET of the task itself returns `404` (`reviews.service.ts` `assertTaskVisible` L996–1010 is more permissive than `mayReadTask`). (b) `POST /notifications/{id}/read` returns `404` for a non-existent id and `403` for another user's — distinguishing existence (`notifications.service.ts` L60–64). Both leak only existence of non-enumerable UUIDs to already-authenticated users.
- **Remediation.** Return `404` uniformly for not-found/not-owned notifications; align the DRAFT-review visibility check with `mayReadTask`.

---

## SDP-VAPT-013 — `/health` discloses environment name

- **Severity:** Informational · **Confidence:** Confirmed
- **CWE:** CWE-200
- **Finding.** `GET /api/health` (public) returns `{"environment":"test"|"production"}` (`health/health.controller.ts:31`). Swagger is correctly off outside development (`SWAGGER_ENABLED` defaults to on only in `development`; confirmed `404` at `/api/docs` in test).
- **Remediation.** Drop `environment` from the public health payload, or gate it behind auth.

---

## SDP-VAPT-014 — e2e suite flaky under parallel execution (test quality)

- **Severity:** Informational · **Confidence:** Confirmed
- **Finding.** The **pre-existing** `email-and-links.e2e-spec.ts` "injection resistance" test asserts global `users/tasks/password_links` row counts are unchanged, but all e2e specs share one database and Vitest runs files in parallel; concurrent mutating suites (e.g. `workflow`) change those counts mid-assertion. Reproduced with the existing four specs alone (run 1 passed, run 2 failed), i.e. not caused by the added security specs. The added security suites pass reliably when run in isolation (3× clean).
- **Remediation.** Run e2e with a single fork (`--pool=forks --poolOptions.forks.singleFork` or `fileParallelism: false`) or scope the invariant to the rows the test itself creates. Out of assessment scope to change the existing test.

---

## Notable controls that passed (not findings)

These were tested and held; they are listed so the report does not read as "nothing works," and so re-tests preserve them.

- **JWT:** HS256 pinned; `alg=none`, HS512, payload-tampering, refresh-as-access, and the in-code test-fallback secret are all rejected (`401`). Issuer/audience/expiry verified. Refresh rotation with reuse detection revokes the session; access token dies immediately on logout, password change, deactivation and email change. (`p1.txt` A2–A11, A24.)
- **CSRF / login-CSRF:** double-submit enforced on all writes; cross-site form-encoded and `text/plain` login attempts rejected by the Origin check / JSON requirement. (`p1.txt` A12, A22–A23; `p2.txt`.)
- **CORS:** no `Access-Control-Allow-Origin` reflected to foreign origins; credentials never exposed cross-origin. (`p2.txt` B1–B3.)
- **BOLA/BFLA:** Developer B cannot read/modify/submit/delete Developer A's task, checklist, events or attachments; Reviewer 2 cannot act on Reviewer 1's review; role-gating on admin/super-admin/reviewer routes is enforced server-side. (`p4.txt` E1–E31.)
- **Mass assignment:** privileged fields (`status`, `developerId`, `currentReviewCycle`, counted cycles) are stripped/rejected on create and update; review `decide` zod-strips unknown keys. (`p5.txt` F1–F2, F11–F12.)
- **Password links:** single-use (including under concurrent submit), purpose-bound, Host-header-poisoning resistant (link always built from `APP_BASE_URL`), no account enumeration, token never leaked in any response/audit/notification, server-side password policy enforced. (`p3.txt`, `p3b.txt`.)
- **Uploads:** magic-byte validation; SVG, `javascript:`, remote URLs, HTML-as-PNG and oversized files all rejected. (`p6.txt`.)
- **SQL injection:** only tagged-template `$queryRaw` used; injection payloads handled as data (parameterised); a build-time guard (`raw-sql.guard.spec.ts`) blocks unsafe raw APIs. Semgrep SQLi pack: 0 findings.
- **Production env validation:** every unsafe production config (missing `sslmode`, `COOKIE_SECURE=false`, http origins, `E2E_MAIL_OUTBOX`, `TRUST_PROXY=true`, short/missing JWT secrets) is rejected at boot. (`env.txt`.)
- **Secrets:** gitleaks found no secrets across 108 commits of history; no secrets in the production web bundle; Semgrep secret pack: 0 findings.
