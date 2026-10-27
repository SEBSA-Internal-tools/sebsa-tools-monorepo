# SDP VAPT — Coverage & authorization matrix

Commit `bcdb115` · 2026-10-11. Legend: **Pass** (control present & verified) · **Fail** (finding raised) · **Blocked** (needs production/unavailable env) · **N/T** (not tested) · **N/A** (not applicable / unimplemented).

## 1. Role × action authorization matrix

Verified at runtime against the seeded roles (Developer A/B, Reviewer 1/2, Admin, Super Admin). "Own" = the acting user's resource; "Other" = another user's. Result is the observed server response; all are server-enforced (client gating is cosmetic).

| Action / endpoint | Developer (own) | Developer (other) | Reviewer | Admin | Super Admin | Verdict |
|---|---|---|---|---|---|---|
| `GET /tasks/:id` DRAFT | 200 | 404 | 404 | 404 | 404 | Pass |
| `PATCH /tasks/:id` | 200 (DRAFT/CR) | 403 | 403 | 200 | 200 | Pass |
| `POST /tasks/:id/submit` | 200 | 403 | 403 | 200 | 200 | Pass |
| `DELETE /tasks/:id` | 204 (own draft) | 403 | 403 | 200 | 200 | Pass |
| `POST /tasks/:id/attachments` | 200 (own, editable) | 403 | 403 | — | — | Pass |
| `GET /tasks/:id/checklist|events` | 200 | 404 | per visibility | per visibility | per visibility | Pass |
| `POST /tasks/:id/pick` | 403 (no reviewer role) | — | 200 (pool); 409 if taken | — | — | Pass |
| `PUT/POST /tasks/:id/review` | — | — | 200 (assigned only); 403 (other reviewer) | — | — | Pass |
| `GET /reviews` | 403 | — | 200 | 200 | 200 | Pass |
| `POST /users` | 403 | 403 | 403 | 201 | 201 | Pass |
| `GET /users` | 403 | — | 403 | 200 | 200 | Pass |
| `DELETE /users/:id` | 403 | 403 | 403 | 403 | 204 | Pass |
| `POST /users/:id/roles/transfer-super-admin` | 403 | — | 403 | 403 | 200* | Pass |
| `POST /checklist-sections` (admin master data) | 403 | — | 403 | 200 | 200 | Pass |
| `POST /customers` | 403 | — | 403 | 200 | 200 | Pass |
| `GET /customers` (global master data) | 200 | — | 200 | 200 | 200 | Pass (by design) |
| `GET /audit-logs` | 403 | — | 403 | 200 | 200 | Pass |
| `GET /system-audit-events` | 403 | — | 403 | 403 | 200 | Pass |
| `POST /notifications/:id/read` (other user's) | 403 | 403 | 403 | 403 | 403 | Pass (see SDP-VAPT-012) |
| Mass assignment of `status`/`developerId`/`currentReviewCycle` | 400 | 400 | — | 400 | 400 | Pass |

\* Transfer refused while the target holds pending review work (verified logic, not forced in this run).

**BOLA/BFLA verdict:** no horizontal or vertical privilege escalation found. The only authorization-adjacent issues are the **cross-task finding oracle (SDP-VAPT-003)** and the **minor existence oracles (SDP-VAPT-012)**.

## 2. Workflow / business-logic transitions

| Transition / rule | Result | Verdict |
|---|---|---|
| Decide/save review before `pick` (no assignment) | 403 | Pass |
| Submit an already-submitted task | 409 | Pass |
| Create/update with privileged extra fields | 400 (whitelist) | Pass |
| Inject `counted`/`excludedAt` into decide body | stripped/ignored | Pass |
| Concurrent `pick` (two reviewers) | one 200, one 409 | Pass |
| **Concurrent approve** | two 200 → duplicate forms | **Fail (SDP-VAPT-001)** |
| **Concurrent submit** | two 200 → duplicate history | **Fail (SDP-VAPT-002)** |
| **Cross-task finding reference** | 403/200 oracle | **Fail (SDP-VAPT-003)** |
| Resubmission routing to follow-up reviewer | per rules | Pass (logic reviewed) |
| Counted-cycle exclusion logic | server-computed | Pass |

## 3. ASVS 4.0.3 L2 coverage (selected chapters)

| ASVS area | Verdict | Note |
|---|---|---|
| V1 Architecture | Pass | Single enforcement point (API); documented threat model (`docs/18-security.md`) |
| V2 Authentication | Pass / **Fail** | Argon2id, generic failures, constant-time; **lockout DoS (SDP-VAPT-004)** |
| V3 Session management | Pass | Rotation, reuse detection, immediate revocation, HttpOnly/SameSite |
| V4 Access control | Pass / **Fail** | Server-enforced RBAC + ownership; **finding oracle (003)**, minor oracles (012) |
| V5 Validation / sanitization | Pass / **Fail** | ValidationPipe whitelist, Zod; **NUL byte 500 (006)** |
| V6 Cryptography | Pass | Argon2id, SHA-256 link tokens, HS256 pinned, CSPRNG tokens |
| V7 Error handling & logging | Pass | Masked 5xx, no body logging, audit log present |
| V8 Data protection | Pass / Blocked | No secrets in bundle; at-rest encryption is Neon (prod, Blocked) |
| V9 Communications | Blocked | TLS/HSTS enforced by code in prod; not observed on a live host |
| V10 Malicious code | Pass | No eval/dynamic require; raw-SQL build guard |
| V11 Business logic | **Fail** | TOCTOU races (001/002) |
| V12 Files & resources | Pass / **Fail** | Strong upload validation; **unbounded lists (008)** |
| V13 API | Pass | REST, DTO validation, pagination on audit |
| V14 Configuration | Pass / **Fail** | Boot-time prod validation; **source maps/CSP (007)**, **config hygiene (010)**, **no CI (011)** |

## 4. OWASP API Security Top 10 (2023)

| Risk | Verdict | Finding |
|---|---|---|
| API1 BOLA | Pass / minor | 003 (oracle), 012 |
| API2 Broken Authentication | Pass | — (strong) |
| API3 BOPLA (property-level) | Pass | mass assignment blocked |
| API4 Unrestricted Resource Consumption | **Fail (Low)** | 004, 008, 009 |
| API5 BFLA | Pass | role gating enforced |
| API6 Unrestricted Business Flows | **Fail (Medium)** | 001, 002 |
| API7 SSRF | N/A | no server-side fetch of user URLs |
| API8 Security Misconfiguration | **Fail (Low)** | 006, 007, 010, 013 |
| API9 Improper Inventory | Info | 011 (no CI/inventory) |
| API10 Unsafe Consumption of APIs | Partial | 005 (dependencies); Brevo client validates/escapes |

## 5. WSTG area coverage

| WSTG area | Verdict |
|---|---|
| Information Gathering (fingerprint, Swagger, health) | Pass / Info (013) |
| Configuration & Deployment | Pass / Blocked (prod host) / Fail (007,010,011) |
| Identity & Authentication | Pass / Fail (004) |
| Authorization | Pass / minor (003,012) |
| Session Management | Pass |
| Input Validation (SQLi, XSS, injection) | Pass / Fail (006) |
| Error Handling | Pass |
| Cryptography | Pass |
| Business Logic | Fail (001,002) |
| Client-side (DOM XSS, redirects, storage) | Pass (no sinks; sanitised redirects) |
| File upload | Pass |

## 6. Explicitly Not Applicable / Blocked

- **N/A (unimplemented):** Entra ID / OIDC (redirect URI, state/nonce/PKCE, tenant restriction), Microsoft Graph / OneDrive / SharePoint (temporary URLs, Graph token handling), Delivery & Wiki features, webhooks (none), multipart upload / `multer` path (not used).
- **Blocked (needs production/unavailable env):** live TLS/HSTS and host security headers, reverse-proxy & `trust proxy` behaviour on real infrastructure, Neon network exposure / backups / at-rest encryption, container/host scanning and OWASP ZAP DAST (no Docker/admin rights), real email delivery (provider out of scope).
