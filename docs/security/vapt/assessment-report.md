# SDP — Vulnerability Assessment & Penetration Test

**Service Delivery Portal (SDP)** · Internal portal for SEBSA World

| | |
|---|---|
| Tested commit | `bcdb115` (branch `feature-charith`) — reference only; nothing committed |
| Date | 2026-10-11 |
| Assessor | Application security review (automated + manual + runtime) |
| Scope | Full repository: NestJS API, React web, shared libraries, config, dependencies, deployment docs |
| Method | Source review · SAST · dependency & secret scan · authenticated runtime pentest · config review |
| Baselines | OWASP ASVS 4.0.3 L2 · WSTG 4.2 · OWASP Top 10 2021 · OWASP API Security Top 10 2023 · CWE · CVSS 3.1 |

> This was an **assessment only**. No application code, `package.json`, or lockfile was changed. The only files added are this report set, redacted evidence, and a security regression test suite (`apps/api/test/e2e/security/`). Scanner tools were installed outside the repository and removed afterwards. Nothing was committed to git.

---

## 1. Executive summary

The SDP backend is **well-engineered for security**. Authentication, session management, authorization, CSRF, input validation, password-link lifecycle, file-upload validation, SQL safety, and production configuration validation are all implemented to a standard above what the brief anticipated, and all held up under direct runtime attack. SAST (Semgrep, ~700 rules across 10 packs), secret scanning (Gitleaks, full history), and ~100 manual runtime probes produced **no Critical or High confirmed application vulnerability**.

The findings that remain are concentrated in three areas:

1. **Concurrency / business-logic integrity** — two time-of-check/time-of-use (TOCTOU) races let concurrent requests create duplicate approvals (Medium) and duplicate submissions (Low). These corrupt the review-cycle metrics and audit trail the portal exists to produce, without granting privilege.
2. **Denial of service via account lockout** — the per-account login throttle can be used to lock any known user out of sign-in (Medium).
3. **Supply chain & operational hygiene** — a critical advisory in a transitive dependency (`proxy-addr`, conditionally reachable), production source maps, no CI/secret-scanning pipeline, and a local `.env` with live-looking secrets sitting in a cloud-synced folder.

**Immediate actions**
- Rotate the Brevo API key and both JWT secrets held in the OneDrive-synced `apps/api/.env`, and move that file out of the synced folder (SDP-VAPT-010).
- Fix the duplicate-approval race before this flow carries real quality data (SDP-VAPT-001).
- Plan the production dependency upgrade, prioritising `proxy-addr`/`express` (SDP-VAPT-005).

**Prioritised risk register**

| Priority | ID | Finding | Severity |
|---|----|---------|----------|
| 1 | SDP-VAPT-010 | Live secrets in cloud-synced `.env` — rotate | Low* |
| 2 | SDP-VAPT-001 | Duplicate approvals (TOCTOU) — **remediated 2026-10-11** | Medium |
| 3 | SDP-VAPT-004 | Account-lockout DoS — **remediated 2026-10-11** | Medium |
| 4 | SDP-VAPT-005 | Vulnerable dependencies (`proxy-addr` critical) | Medium |
| 5 | SDP-VAPT-002 | Duplicate submissions (TOCTOU) | Low |
| 6 | SDP-VAPT-003 | Cross-task finding oracle | Low |
| 7 | SDP-VAPT-006 | NUL byte → 500 | Low |
| 8 | SDP-VAPT-007 | Source maps / no SPA CSP | Low |
| 9 | SDP-VAPT-008 | Unbounded lists | Low |
| 10 | SDP-VAPT-009 | In-memory rate limiter | Low |
| 11 | SDP-VAPT-011 | No CI / secret scanning | Low |
| — | SDP-VAPT-012/013/014 | Minor oracles, health disclosure, flaky e2e | Info |

\* The *finding* is low (file is git-ignored and was never committed), but the *recommended action — credential rotation — is immediate* because of the cloud-sync exposure.

Full detail, CWE/OWASP/ASVS/CVSS mapping, reproduction and remediation for every item are in [`findings.md`](./findings.md).

---

## 2. Architecture & scope (verified from code)

- **Monorepo:** npm workspaces + Nx. `apps/api` (NestJS 12, Express 5, Prisma 6.19, PostgreSQL), `apps/web` (React 19, Vite 8, React Router 7), `packages/contracts` (shared Zod schemas).
- **Roles:** `DEVELOPER`, `REVIEWER`, `ADMIN`, `SUPER_ADMIN` — database rows, not an enum. Super Admin is exclusive, moved only by Transfer. **There is no customer/tenant data-isolation boundary**; customers and task types are global master data readable by any authenticated user (by design — confirmed, not a finding).
- **Auth:** cookie JWTs, HS256 pinned, `sdp_access` (15 min) + rotated `sdp_refresh` (argon2-hashed, reuse detection), CSRF double-submit, per-request session+status re-check. Argon2id password hashing.
- **Password links:** `apps/api/src/modules/password-links` — 32-byte CSPRNG tokens, SHA-256 at rest, single-use, purpose-bound, delivered via the `#token=` fragment; link base is `APP_BASE_URL`.
- **Attachments:** base64 data URLs stored in Postgres, validated on decoded bytes (PNG/JPEG/GIF/WebP, ≤5 MB).
- **Email:** Brevo HTTP API; dev/test use an outbox (file/log), never a real send.
- **Not implemented (future scope, treated as out of scope):** Microsoft Entra ID / OIDC (only an `entraObjectId` column), Microsoft Graph / OneDrive / SharePoint, and the Delivery and Wiki features.
- **Not in the repository:** CI pipeline, Dockerfile, hosting/reverse-proxy config, `.env.example`, and any security tooling config.

**Tested commit / environment.** HEAD `bcdb115` on `feature-charith`, 108 commits of history. Host: Windows 11, Node v24.16.0, PostgreSQL 18 binaries, no Docker, no admin rights. Runtime testing used the project's existing throwaway harness: a private PostgreSQL cluster (`initdb` in OS temp, `127.0.0.1:55432/sdp_e2e`), the NestJS API on `127.0.0.1:3100` (`NODE_ENV=test`, Swagger off, email to a temp outbox), seeded via `prisma migrate deploy` + `seed-e2e`. The shared Neon database was never touched.

---

## 3. Methods, tools & versions

| Activity | Tool | Version | Scope / command | Result |
|---|---|---|---|---|
| SAST | Semgrep | 1.180.0 | `p/typescript,p/nodejs,p/react,p/jwt,p/secrets,p/owasp-top-ten,p/expressjs,p/xss,p/sql-injection,p/security-audit,p/gitleaks` over `apps/`,`packages/`, `--metrics=off` | 0 findings |
| Secret scan | Gitleaks | 8.30.1 | `git` (108 commits, `--redact`) + `dir` over working tree | History clean; working-tree hits = git-ignored local `.env` + ignored test outbox |
| Dependency audit | npm audit | npm 10 (Node 24) | `npm audit`, `npm audit --omit=dev` | 34 total / 9 production (triaged, SDP-VAPT-005) |
| SCA | osv-scanner | 2.6.0 | `scan source -L package-lock.json` | Cross-checked npm audit |
| Runtime pentest | Node fetch probes (bounded) | — | ~100 requests across auth, authz, workflow, input, uploads, password links | See §4, evidence folder |
| Config validation | tsx harness | — | `validate()` under `NODE_ENV=production` with unsafe inputs | All unsafe configs rejected |
| Bundle review | vite build + scan | Vite 8.2.1 | built `dist/apps/web`, scanned for secrets/maps | 124 `.map` files; **no secrets** |
| Regression tests | Vitest e2e | 4.1.10 | `apps/api/test/e2e/security/**` against throwaway DB | at assessment: 19 pass / 5 `it.fails`; after 2026-10-11 fixes: 22 pass / 3 `it.fails` |

Scanner installation (Semgrep via a Python venv; Gitleaks and osv-scanner release binaries, checksum-verified) was done in a temp folder outside the repository and removed at the end (see [`retest-instructions.md`](./retest-instructions.md) and [`evidence/tooling.md`](./evidence/tooling.md)). No source code was uploaded to any external service; Semgrep ran fully offline with telemetry disabled.

**Limitations.**
- No Docker / admin rights, so OWASP ZAP and container/host scanning were not run; DAST was performed with scripted, bounded HTTP probes instead.
- Entra ID/OIDC, Graph/OneDrive/SharePoint and Delivery/Wiki are unimplemented and were reviewed as future scope only.
- Production deployment (TLS termination, reverse proxy, host headers, Neon network posture) could not be tested — production hardening is asserted by code/boot-time validation and documentation, not observed on a live host. Those items are marked **Blocked** in the coverage matrix.
- Email provider (Brevo) and other third-party infrastructure were explicitly out of scope and not contacted.

---

## 4. Testing performed (high level)

- **Authentication & session:** JWT algorithm confusion (`alg=none`, HS512), payload tampering, refresh-as-access, in-code test-secret forgery, refresh rotation & reuse detection, logout/deactivation/role-change revocation, cookie flags, enumeration timing, login throttling, login-CSRF. → all controls held; **SDP-VAPT-004** (lockout DoS) confirmed.
- **Authorization (BOLA/BFLA):** two developers, two reviewers, admin, super admin across tasks, attachments, checklists, events, reviews, responses, notifications, users, roles, audit. → enforced server-side throughout; **SDP-VAPT-012** minor oracles only.
- **Workflow integrity:** illegal state transitions, mass assignment, counted-cycle manipulation, concurrent approve/submit, cross-task finding reference. → transitions and mass assignment solid; **SDP-VAPT-001/002/003** confirmed.
- **Input & transport:** CORS from evil origins, malformed/oversized bodies (incl. forged-cookie body-parser bypass attempt), SQL/NoSQL payloads, pagination bounds, error leakage, Swagger/health exposure, upload validation (SVG/js/remote/polyglot/oversized), NUL bytes. → strong; **SDP-VAPT-006/008/013** noted.
- **Password-link lifecycle:** single-use (incl. concurrent), expiry, purpose binding, resend invalidation, Host-header poisoning, enumeration, token leakage, server-side policy. → all held.
- **Static/supply-chain/secrets/config:** SAST, dependency audit, secret scan, production env validation, bundle secret scan, `.gitignore`/bootstrap review. → **SDP-VAPT-005/007/010/011**.

---

## 5. Authorization matrix & coverage

The role × action authorization matrix and the ASVS/WSTG coverage table (marked Passed / Failed / Blocked / Not Tested / N/A) are in [`coverage-matrix.md`](./coverage-matrix.md). Remediation sequencing is in [`remediation-plan.md`](./remediation-plan.md). Re-test and tool-reinstall steps are in [`retest-instructions.md`](./retest-instructions.md).

---

## 6. Cleanup performed & remaining state

- The throwaway PostgreSQL cluster was reset and stopped (`e2e-db.mjs down`). Its data directory in the OS temp folder pre-existed this assessment and was left in place.
- Scanner tools (Semgrep venv, Gitleaks/osv binaries), probe scripts, the mail outbox, and the `dist/` build output were created **outside** the repository (or are git-ignored build output) and removed/left as throwaway; see `retest-instructions.md` §Cleanup.
- Synthetic accounts and tasks created during testing exist only in the disposable e2e database and are gone on reset.
- No change was made under `apps/*/src`, to `package.json`, or to lockfiles. **Nothing was committed to git.** The only repository additions are `docs/security/vapt/**` and `apps/api/test/e2e/security/**`.

> **This assessment did not find the application to be free of vulnerabilities.** It found no Critical/High *confirmed* issues within the tested, implemented surface, but production deployment, the unimplemented SSO/storage integrations, and the dependency chain remain untested or only partially covered. Treat the Medium findings as action items, not residual noise.
