# SDP VAPT — Retest instructions

How to reproduce the assessment and re-verify each finding. Everything runs locally against the disposable e2e database; the shared Neon database is never touched.

## 0. Guardrails (unchanged from the assessment)
- Targets: `http://127.0.0.1:3100/api` and the throwaway PostgreSQL at `127.0.0.1:55432/sdp_e2e` only.
- Always set `E2E_DATABASE_URL` explicitly; never run migrations/seeds/tests against Neon. Never `prisma migrate reset`.
- Email stays disabled / captured to an outbox file; no real sends.

## 1. Regression test suite (primary retest path)
The security suite encodes the confirmed findings. Confirmed-but-open vulnerabilities are `it.fails` (green while the bug exists); passing controls are normal `it`.

```bash
# one-time: start the throwaway cluster and seed it
npm run e2e:db:up   -w @sdp/api
E2E_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/sdp_e2e npm run e2e:db:reset -w @sdp/api

# run only the security suite (stable in isolation)
cd apps/api
E2E_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/sdp_e2e \
  npx vitest run --config vitest.e2e.config.ts test/e2e/security
```
Expected today: **22 passed | 3 expected fail (25)**. The 3 `it.fails` are `SDP-VAPT-002`, `-003` and `-006`. `SDP-VAPT-001` and `-004` were remediated on 2026-10-11 and are now plain `it` tests.

**After fixing a finding:** flip its `it.fails(...)` to `it(...)` in the relevant spec and the test must pass:
| Finding | Spec | Test title prefix |
|---|---|---|
| SDP-VAPT-001 | `security/workflow-integrity.e2e-spec.ts` | `SDP-VAPT-001: concurrent approve …` |
| SDP-VAPT-002 | `security/workflow-integrity.e2e-spec.ts` | `SDP-VAPT-002: concurrent submit …` |
| SDP-VAPT-003 | `security/workflow-integrity.e2e-spec.ts` | `SDP-VAPT-003: … finding … oracle` |
| SDP-VAPT-004 | `security/authn.e2e-spec.ts` | `SDP-VAPT-004: … locked out …` |
| SDP-VAPT-006 | `security/input-validation.e2e-spec.ts` | `SDP-VAPT-006: … NUL byte …` |

> Run the **security** folder on its own. Running the whole e2e suite in parallel is flaky due to a pre-existing shared-DB assertion (SDP-VAPT-014); use `--pool=forks --poolOptions.forks.singleFork` if you must run everything at once.

Reset the DB between runs if a run leaves data:
```bash
E2E_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/sdp_e2e npm run e2e:db:reset -w @sdp/api
```

## 2. Manual runtime re-probe (optional)
Boot the API exactly as the assessment did:
```bash
E2E_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/sdp_e2e \
E2E_MAIL_OUTBOX=<temp>/mail-outbox.jsonl \
  node apps/api/scripts/e2e-serve.mjs       # API on 127.0.0.1:3100, NODE_ENV=test, Swagger off
```
Seed accounts (all share `E2e-Passw0rd!2026`): `e2e.dev@`, `e2e.reviewer@`, `e2e.reviewer2@`, `e2e.admin@`, `e2e.super@`, `e2e.admin.reviewer@`, `e2e.devrev@` `@example.com`.

Per-finding quick checks (bounded; stop at first 429):
- **001/002:** fire the approve/submit POST twice concurrently; check `GET /api/tasks/:id/reviews` has one `APPROVED` form and events have one `SUBMITTED` row.
- **003:** as Reviewer X on task X, PUT a draft whose comment `id` is a finding UUID from task Y with wrong vs right text — expect identical status once fixed.
- **004:** 5 wrong logins for a known email, then a correct one — expect `200` once fixed (currently `429`).
- **006:** POST an attachment with `fileName:"a\u0000b.png"` — expect `< 500` once fixed.

## 3. Static / supply-chain / secret re-scan
Reinstall the scanners outside the repo (no admin rights needed):
```bash
# Semgrep (Python venv in a short temp path; long repo paths break pip on Windows)
python -m venv %TEMP%\sdpvapt\v && %TEMP%\sdpvapt\v\Scripts\pip install semgrep
SEMGREP_SEND_METRICS=off %TEMP%\sdpvapt\v\Scripts\semgrep scan --metrics=off \
  --config p/typescript --config p/nodejs --config p/react --config p/jwt \
  --config p/secrets --config p/owasp-top-ten --config p/expressjs --config p/xss \
  --config p/sql-injection --config p/security-audit --config p/gitleaks \
  --exclude node_modules --exclude dist apps packages

# Gitleaks & osv-scanner: download the official release binaries (verify checksums)
gitleaks git  . --redact=100
gitleaks dir  . --redact=100 --max-target-megabytes 5
osv-scanner scan source -L package-lock.json

# npm audit (production set is what matters)
npm audit --omit=dev
```
Versions used in the assessment: Semgrep 1.180.0, Gitleaks 8.30.1, osv-scanner 2.6.0.

## 4. Production-config re-validation (no live host needed)
Confirm the boot-time guard still rejects unsafe production config:
```bash
# from apps/api, a short tsx script importing validate() from src/config/env.validation.ts
# assert REJECTED for: missing sslmode, COOKIE_SECURE=false, http FRONTEND_ORIGIN/APP_BASE_URL,
# EMAIL_ENABLED=false, E2E_MAIL_OUTBOX set, TRUST_PROXY=true, short/missing JWT secrets.
```
(The assessment's throwaway script lived outside the repo; see `evidence/tooling.md`.)

## 5. Web bundle re-check (SDP-VAPT-007)
```bash
npx vite build --config apps/web/vite.config.ts
find dist/apps/web -name "*.map" | wc -l        # expect 0 after the fix
grep -ri "xkeysib\|JWT_.*SECRET\|postgresql://" dist/apps/web/assets   # expect none (already clean)
```

## Cleanup (what the assessment removed afterwards)
```bash
npm run e2e:db:down -w @sdp/api        # stop the throwaway cluster
rm -rf %TEMP%/sdpvapt                   # scanners, venv, probe scripts, outbox
rm -rf dist/apps/web                     # build output (git-ignored)
git status --short                       # expect only docs/security/vapt/** and apps/api/test/e2e/security/**
```
No commits were made. The scanner tools and probe scripts never lived inside the repository.
