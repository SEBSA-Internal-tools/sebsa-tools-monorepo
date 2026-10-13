# Tooling — versions, commands, scope, failures

All scanners were installed **outside** the repository (Windows, no admin rights) and removed after the assessment. No source code left the machine; Semgrep ran offline with telemetry disabled.

## Host
- Windows 11 Pro, Node v24.16.0, Python 3.14, PostgreSQL 18 binaries (`C:\Program Files\PostgreSQL\18`).
- No Docker, no admin rights → OWASP ZAP and container/host scanning not run (DAST done with scripted HTTP probes instead).
- Git HEAD `bcdb115`, 108 commits.

## Installed tools (temp, removed afterwards)
| Tool | Version | Install method | Location (temp) |
|---|---|---|---|
| Semgrep | 1.180.0 | `python -m venv` + `pip install semgrep` | `%TEMP%\sdpvapt\v` |
| Gitleaks | 8.30.1 | official GitHub release zip, SHA-256 verified | `%TEMP%\...\scratchpad\bin` |
| osv-scanner | 2.6.0 | official GitHub release exe, SHA-256 verified | `%TEMP%\...\scratchpad\bin` |
| npm audit | npm 10 / Node 24 | built-in | — |

Checksum verification (both matched the published checksum files):
- `gitleaks_8.30.1_windows_x64.zip` → `d29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e`
- `osv-scanner_windows_amd64.exe` → `e0ed7644118b717b028c249ee9d3515024e55e8510747ca08906eb96765354d6`

## Commands
```bash
# SAST (two runs; metrics disabled; from repo root)
SEMGREP_SEND_METRICS=off semgrep scan --metrics=off \
  --config p/typescript --config p/nodejs --config p/react --config p/jwt \
  --config p/secrets --config p/owasp-top-ten --exclude node_modules --exclude dist apps packages
SEMGREP_SEND_METRICS=off semgrep scan --metrics=off \
  --config p/expressjs --config p/xss --config p/sql-injection --config p/security-audit \
  --config p/gitleaks --exclude node_modules --exclude dist apps packages

# Secret scan
gitleaks git . --redact=100 --log-opts=--all
gitleaks dir . --redact=100 --max-target-megabytes 5

# Dependency / SCA
npm audit --json ; npm audit --omit=dev --json
osv-scanner scan source -L package-lock.json

# Runtime API (throwaway DB, NODE_ENV=test, Swagger off, email to outbox file)
E2E_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/sdp_e2e \
E2E_MAIL_OUTBOX=%TEMP%\sdpvapt\mail-outbox.jsonl node apps/api/scripts/e2e-serve.mjs

# Runtime probes (bounded, ~100 requests total) — Node fetch scripts outside the repo
node p1-authn.mjs ; node p2-input.mjs ; node p3-links.mjs ; node p3b-singleuse.mjs
node p4-authz.mjs ; node p5-workflow.mjs ; node p5b-race-detail.mjs ; node p6-uploads.mjs

# Web bundle inspection
npx vite build --config apps/web/vite.config.ts   # then grep dist for *.map and secrets

# Production env validation (tsx, importing validate() from env.validation.ts)
node --import tsx <script that calls validate() with unsafe prod configs>
```

## Failures / notes
- pip failed to create the venv inside the deep scratchpad path (`WinError 206`, path too long); the venv was placed in a short `%TEMP%\sdpvapt` path instead.
- Semgrep emitted `PartialParsing` warnings on a few `.tsx` files (JSX the OSS parser choked on) and on `packages/types/src/index.ts`; these are parser limitations, not findings. Coverage: 444→477 files scanned.
- The standalone probe scripts (p1–p6) left synthetic data in the throwaway DB; a `e2e-db reset` restores the clean seed. This is why the full e2e suite must be run after a reset (see SDP-VAPT-014).

## Request budget / safety
- Total runtime requests well under the planned bound; throttle probes stopped at the first `429`.
- One ~9 MB and one ~20 MB body were sent once each to test body-size limits (both rejected pre-auth). No load/DoS testing.
- No real emails sent (outbox only). No connection to Neon, Brevo, Microsoft, or any external infrastructure.
