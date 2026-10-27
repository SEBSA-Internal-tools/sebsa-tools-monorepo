# SDP VAPT — Remediation plan

Ordered by risk-adjusted urgency. Each item links to the finding in [`findings.md`](./findings.md) and the regression test that proves the fix. None of these were applied during the assessment.

## Now (this week)

### 1. Rotate the cloud-synced secrets — SDP-VAPT-010
The dev `apps/api/.env` holds live-looking `SDP_BREVO_API_KEY`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and a `DATABASE_URL`, and lives in a OneDrive-synced folder.
- Rotate the Brevo API key (Brevo console) and both JWT secrets. Rotating the JWT secrets invalidates existing sessions — expected.
- Move the file out of the synced folder (e.g. a non-synced local path) and point the dev process at it.
- Deleting the file is **not** sufficient — rotate, because a copy may already be in cloud storage.
- Verify: `git ls-files apps/api/.env` returns nothing (already true); confirm the new key/secret values are not under any synced path.

### 2. Close the approval race — SDP-VAPT-001 (Medium)
In `reviews.service.ts` `decide()`, make the task transition conditional **inside** the transaction. Re-read `status` under the existing `FOR UPDATE` lock in `ensureReviewRoundStarted` (or replace `tx.task.update({where:{id}})` with a conditional `updateMany({where:{id,status:'IN_REVIEW',currentReviewerId:user.id}})` and treat `count!==1` as `409`). Mirror the `pick()` pattern (L1099–1123).
- Verify: flip `SDP-VAPT-001` in `workflow-integrity.e2e-spec.ts` from `it.fails` to `it`; it must pass (exactly one `APPROVED` form after concurrent approvals).
- **Done 2026-10-11.** Conditional `updateMany`; the losing request gets 409. Test flipped to `it` and passing.

### 3. Soften account lockout — SDP-VAPT-004 (Medium)
Keep per-IP throttling; change per-account lockout so it cannot be weaponised: throttle per `(email, IP)` tuple, or add a delay/CAPTCHA step-up instead of a hard 15-minute block, or let a correct password within the window succeed and reset the counter. Preserve the existing enumeration-safe generic failure.
- Verify: flip `SDP-VAPT-004` in `authn.e2e-spec.ts` to `it`.
- **Done 2026-10-11.** Uses OWASP device cookies (`sdp_device`), so the distributed-guessing limit and the "correct password still fails when locked" rule are kept. The test is now `it` and passing.

## Next (this sprint)

### 4. Plan the production dependency upgrade — SDP-VAPT-005 (Medium)
*Interim mitigation, documented for the hosting phase:* `docs/27-production-hosting-runbook.md` has NGINX overwrite `X-Forwarded-For` and the API run with `TRUST_PROXY=1` (a hop count), which avoids the vulnerable `proxy-addr` subnet path. It applies once hosting is set up.
Prioritise `proxy-addr`/`express` (critical, conditionally reachable), then `@nestjs/platform-express` ≥12.1.2 (pulls fixed `multer`), `prisma`/`@prisma/client`, and dev tooling (`@nx/*`, `vitest`). Re-run `npm audit --omit=dev` until the production set is clean. Follow the project's dependency-governance process (`docs/15`).
- Verify: `npm audit --omit=dev` → 0 high/critical; `osv-scanner scan source -L package-lock.json`.

### 5. Close the submit race — SDP-VAPT-002 (Low)
Same conditional-update pattern as #2, in `review-tasks.service.ts` `submit()`.
- Verify: flip `SDP-VAPT-002` to `it`.

### 6. Scope the finding lookup — SDP-VAPT-003 (Low)
In `persistDraft()`, change the stored-finding query to `where: { reviewFormId: form.id }` and reject/ignore incoming IDs resolving to another task, removing the 403-vs-200 text oracle.
- Verify: flip `SDP-VAPT-003` to `it`.

### 7. Reject control characters at the boundary — SDP-VAPT-006 (Low)
Strip or reject `\u0000`–`\u001f` in user-supplied text DTOs (filenames, captions, names, notes, reasons) so a NUL byte yields a clean 4xx, not a 500.
- Verify: flip `SDP-VAPT-006` to `it` (status `< 500`).

### 8. Harden the web deployment — SDP-VAPT-007 (Low)
Set `sourcemap: false` for the production build (or upload maps to an error tracker and block `*.map` at the host). Commit a host config (`vercel.json` / `_headers` / nginx) sending the `docs/18-security.md` header set (CSP, X-Frame-Options, nosniff, Referrer-Policy, HSTS).
- Verify: built `dist` has no `.map` (or host 404s them); `curl -I` the HTML shows CSP/HSTS.

## Later (backlog)

### 9. Add a CI pipeline — SDP-VAPT-011 (Low)
Lint, typecheck, unit + e2e (single-fork for e2e), and `npm audit --omit=dev` as a merge gate; SHA-pinned actions, least-privilege `permissions:`; enable Dependabot and secret scanning. This would have caught SDP-VAPT-005 automatically. Reconcile `docs/01` which claims CI exists.

### 10. Paginate list endpoints — SDP-VAPT-008 (Low)
Server-side pagination with a capped page size on `/tasks`, `/reviews`, `/notifications`, `/users`, `/handovers`, `/customers`; return attachment metadata (not inline base64) in lists. Pairs with the "attachments → object storage" follow-up.

### 11. Shared rate-limit store before scale-out — SDP-VAPT-009 (Low)
Move the sliding window to Redis (`INCR`/`EXPIRE`) before running more than one API instance; document and validate the deployment's `TRUST_PROXY` value.

### 12. Minor hardening — SDP-VAPT-010/012/013
Add `.env.production`/`.env.development`/`.env*` to `.gitignore` (keep `!.env.example`); add `BOOTSTRAP_SUPER_ADMIN_*` to the env schema and make the seed non-destructive to an existing active account; return a uniform 404 for not-found/not-owned notifications and align DRAFT-review visibility with `mayReadTask`; drop `environment` from the public `/health` payload.

### 13. Test reliability — SDP-VAPT-014
Run the e2e suite single-fork (`fileParallelism: false`) or scope the `email-and-links` count invariant to self-created rows, so the shared-DB assertion is not flaky.

## Suggested implementation order (dependency-aware)
`#1 (rotate)` → `#2, #3` (quick, high value, isolated service changes) → `#4` (dependency upgrade, test-heavy) → `#5–#8` (remaining app/build fixes) → `#9` (CI, which then guards everything) → `#10–#13` (scale/hardening/quality). Items #2, #3, #5, #6, #7 are each small and independently shippable with a ready regression test.
