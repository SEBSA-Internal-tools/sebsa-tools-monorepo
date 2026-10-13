# SDP — VAPT (Vulnerability Assessment & Penetration Test)

Assessment of the Service Delivery Portal at commit `bcdb115`, 2026-10-11. Source review + SAST + dependency/secret scanning + authenticated local runtime pentest, mapped to OWASP ASVS 4.0.3 L2 / WSTG 4.2 / OWASP Top 10 2021 / API Security Top 10 2023 / CWE / CVSS 3.1.

## Documents
| File | Purpose |
|---|---|
| [`assessment-report.md`](./assessment-report.md) | Executive summary, scope, method, tools, limitations, cleanup |
| [`findings.md`](./findings.md) | Full findings register (14 items) + controls that passed |
| [`coverage-matrix.md`](./coverage-matrix.md) | Role×action authorization matrix + ASVS/WSTG/API-Top-10 coverage |
| [`remediation-plan.md`](./remediation-plan.md) | Prioritised, dependency-aware fix order |
| [`retest-instructions.md`](./retest-instructions.md) | How to reproduce and re-verify every finding |
| [`evidence/`](./evidence/) | Redacted runtime evidence, scanner summaries, tooling log |

## Headline
No Critical/High **confirmed** application vulnerability. Confirmed issues: two TOCTOU races (duplicate approvals = Medium, duplicate submissions = Low), account-lockout DoS (Medium), a cross-task finding oracle (Low), a NUL-byte 500 (Low), production source maps / no SPA CSP (Low), and supply-chain/config hygiene items. See the report for the prioritised list and the **immediate action** to rotate the secrets in the OneDrive-synced `apps/api/.env`.

## Regression tests
`apps/api/test/e2e/security/` — run with the throwaway DB:
```bash
E2E_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/sdp_e2e \
  npx vitest run --config apps/api/vitest.e2e.config.ts test/e2e/security
```
Expected: **22 passed | 3 expected fail**. Still-open findings are `it.fails` (SDP-VAPT-002/003/006); flip each to `it` as it is fixed.

**Remediated (2026-10-11):**
- SDP-VAPT-001: the approval race uses a conditional update.
- SDP-VAPT-004: the lockout DoS is fixed with device cookies.

Both are now asserted with `it`. Production proxy hardening is documented for the hosting phase (not yet applied) in the [Production hosting runbook](../../27-production-hosting-runbook.md). It covers TLS, CSP, edge rate limits, body limits, and `TRUST_PROXY=1` with an overwritten `X-Forwarded-For`, which mitigates the `proxy-addr` advisory.
