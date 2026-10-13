# Scanner evidence (redacted summaries)

## Semgrep 1.180.0
Packs: p/typescript, p/nodejs, p/react, p/jwt, p/secrets, p/owasp-top-ten (run 1); p/expressjs, p/xss, p/sql-injection, p/security-audit, p/gitleaks (run 2). Scope: apps/ packages/, metrics off.

```
run 1: results=0 errors=3 scanned=444
 • Rules run: 118
Ran 118 rules on 444 files: 0 findings.
run 2: results=0 scanned=477
Finding count across all packs: 0 (only PartialParsing warnings on a few TSX files).
```

## Gitleaks 8.30.1
```
git mode (108 commits, full history): no leaks found
dir mode (working tree): 6 hits, all in git-IGNORED files ->
  generic-api-key  apps/api/.env:6  (secret value redacted)
  generic-api-key  apps/api/.env:7  (secret value redacted)
  sendinblue-api-token  apps/api/.env:12  (secret value redacted)
  generic-api-key  apps/web-e2e/test-results/mail-outbox.jsonl:12  (secret value redacted)
  generic-api-key  apps/web-e2e/test-results/mail-outbox.jsonl:14  (secret value redacted)
  generic-api-key  apps/web-e2e/test-results/mail-outbox.jsonl:16  (secret value redacted)
  - apps/api/.env : untracked, git-ignored, never committed (local dev secrets) -> ROTATE (SDP-VAPT-010)
  - apps/web-e2e/test-results/mail-outbox.jsonl : git-ignored test artifact
```

## npm audit (production dependencies only)
```
vulnerabilities: {"info":0,"low":0,"moderate":2,"high":6,"critical":1,"total":9}
  @nestjs/platform-express  high  direct
  @prisma/config  high  transitive
  deepmerge-ts  high  transitive
  fast-uri  moderate  transitive
  multer  high  transitive
  prisma  high  direct
  proxy-addr  critical  transitive
  source-map-js  high  transitive
  valibot  moderate  transitive
```
Full audit (incl. dev tooling): {"info":0,"low":0,"moderate":10,"high":22,"critical":2,"total":34}
Triage in findings.md SDP-VAPT-005 (multer not reachable; proxy-addr conditional).

## osv-scanner 2.6.0 (package-lock.json)
```
vulnerable packages reported: 16 (cross-checked against npm audit)
```

## Web bundle secret scan (SDP-VAPT-007)
```
.map files in dist/apps/web: 124
secrets found in bundle: NONE (no Brevo key, DB URL, JWT secret, or VITE_* secret)
```
