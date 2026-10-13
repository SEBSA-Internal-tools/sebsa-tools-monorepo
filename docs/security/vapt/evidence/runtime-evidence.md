# Redacted runtime evidence

Bounded local probes against `http://127.0.0.1:3100` on the throwaway e2e database, 2026-10-11.
Tokens, cookies and secrets are redacted; only status codes and shapes are shown.

## authn (p1)
```
[A1] login Set-Cookie flags {"sdp_access":"sdp_access=<redacted>; Max-Age=900; Path=/; Expires=Sun, 11 Oct 2026 14:58:13 GMT; HttpOnly; SameSite=Lax","sdp_refresh":"sdp_refresh=<redacted>; Max-Age=604800; Path=/api/auth; Expires=Sun, 18 Oct 2026 14:43:13 GMT; HttpOnly; SameSite=Lax","sdp_csrf":"sdp_csrf=<redacted>; Max-Age=604800; Path=/; Expires=Sun, 18 Oct 2026 14:43:13 GMT; SameSite=Lax"}
[A2] access token claims (keys) {"alg":"HS256","keys":["sub","sid","iss","aud","jti","typ","iat","exp"],"ttl":900}
[A3] alg=none token -> /auth/me 401
[A4] tampered payload -> /auth/me 401
[A5] token signed with in-code TEST fallback secret -> /auth/me 401
[A6] refresh token presented as access -> /auth/me 401
[A7] HS512 token -> /auth/me 401
[A8] refresh #1 status / rotated {"status":200,"rotated":true}
[A9] replay OLD refresh token 401
[A10] NEW refresh token after reuse was detected (session should be revoked) 401
[A11] original access token after reuse detection -> /auth/me 401
[A12] refresh without CSRF header 403
[A13] known-wrong vs unknown: status/body/ms {"known":[[401,"INVALID_CREDENTIALS",50],[401,"INVALID_CREDENTIALS",45],[401,"INVALID_CREDENTIALS",48],[401,"INVALID_CREDENTIALS",69]],"unknown":[[401,"INVALID_CREDENTIALS",84],[401,"INVALID_CREDENTIALS",43],[401,"INVALID_CREDENTIALS",74],[401,"INVALID_CREDENTIALS",48]]}
[A14] victim correct password after 5 attacker failures (lockout DoS) {"status":429,"code":"RATE_LIMITED"}
[A15] case/space variant of locked email 429
[A16] login without Origin header 200
[A17] login with evil Origin 403
[A18] login with Origin "null" 403
[A19] 129-char password {"status":400,"code":"VALIDATION_FAILED"}
[A20] NoSQL-style object credentials {"status":400,"code":"VALIDATION_FAILED"}
[A21] SQLi-style credentials {"status":400,"code":"VALIDATION_FAILED"}
[A22] cross-site form-encoded login (login CSRF) 403
[A23] text/plain JSON login (simple request CSRF) 400
[A24] access token after logout 401
```

## input-transport (p2)
```
[B1] CORS preflight from evil origin: ACAO / ACAC {"status":204,"acao":null,"acac":"true"}
[B2] credentialed GET from evil origin: ACAO {"status":200,"acao":null}
[B3] allowed origin ACAO http://localhost:5185
[B4] GET /api/docs {"status":404,"body":"<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<title>Error</title>\n</head>\n<body>\n<pre>Cannot GET /api/"}
[B4] GET /api/docs-json {"status":404,"body":"<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<title>Error</title>\n</head>\n<body>\n<pre>Cannot GET /api/"}
[B4] GET /api {"status":200,"body":"Hello World!"}
[B4] GET /api/health {"status":200,"body":"{\"status\":\"ok\",\"timestamp\":\"2026-10-11T14:43:44.215Z\",\"environment\":\"test\"}"}
[B4] GET /api/../../etc/passwd {"status":404,"body":"<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<title>Error</title>\n</head>\n<body>\n<pre>Cannot GET /etc/"}
[B4] GET /.env {"status":404,"body":"<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<title>Error</title>\n</head>\n<body>\n<pre>Cannot GET /.env"}
[B4] GET /api/.env {"status":404,"body":"<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<title>Error</title>\n</head>\n<body>\n<pre>Cannot GET /api/"}
[B5] malformed JSON body {"status":400,"body":"{\"statusCode\":400,\"code\":\"VALIDATION_FAILED\",\"message\":\"The request body is not valid JSON.\",\"details\":[],\"timestamp\":\"2026-10-11T14:43:44.226Z\"}"}
[B6] non-UUID task id {"status":400,"body":"{\"statusCode\":400,\"code\":\"VALIDATION_FAILED\",\"message\":\"Validation failed (uuid is expected)\",\"details\":[],\"timestamp\":\"2026-10-11T14:43:44.232Z\"}"}
[B7] prototype keys in body {"status":400,"body":"{\"statusCode\":400,\"code\":\"VALIDATION_FAILED\",\"message\":\"color must be a 6-digit hex value such as #2563eb\",\"details\":[\"color must be a 6-digit hex value such as #2563eb\",\"color must be a string\"],\"tim"}
[B8] 9MB anonymous attachment POST, no cookie {"status":413,"ms":34}
[B9] 9MB anonymous attachment POST, forged sdp_access cookie {"status":413,"code":"PAYLOAD_TOO_LARGE","ms":33}
[B10] 20MB anonymous review PUT, forged cookie {"status":401,"code":"AUTH_REQUIRED","ms":114}
[B11] dev GET /api/tasks?scope=mine {"status":200,"bytes":59,"pagination":{"page":1,"pageSize":1,"total":0}}
[B11] dev GET /api/notifications {"status":200,"bytes":2}
[B11] dev GET /api/reviews {"status":403,"bytes":111}
[B11] dev GET /api/customers {"status":200,"bytes":151}
[B12] admin GET /api/users {"status":200,"bytes":1749}
[B12] admin GET /api/tasks?scope=all {"status":200,"bytes":59}
[B12] admin GET /api/handovers {"status":200,"bytes":2}
[B12] admin GET /api/audit-logs?pageSize=100000 {"status":400,"bytes":186,"code":"VALIDATION_FAILED"}
[B12] admin GET /api/audit-logs?search=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa {"status":200,"bytes":75}
[B12] admin GET /api/audit-logs?search=%27%20OR%201%3D1-- {"status":200,"bytes":75}
[B12] admin GET /api/audit-logs?sortBy=password {"status":400,"bytes":176,"code":"VALIDATION_FAILED"}
[B12] admin GET /api/audit-logs?page=-1 {"status":400,"bytes":168,"code":"VALIDATION_FAILED"}
[B13] /auth/me keys ["id","email","name","roles","isActive","createdAt"]
[B14] /users item keys (sensitive?) ["id","name","email","roles","isActive","createdAt","status","inviteExpiresAt","inviteEmailStatus"]
[B15] response headers on authed JSON {"cc":null,"pragma":null}
```

## password-links (p3)
```
[C1] admin create user (INVITED) {"status":201}
[C2] invite email captured; token length (redacted) {"subject":"You have been invited to the Service Delivery Portal","tokenLen":43}
[C3] validate invite token {"status":200,"purpose":"INVITE","emailHint":"v***@example.com","hasExpiry":true}
[C4] validate response headers {"cc":"no-store","rp":"no-referrer"}
[C5] forgot-password with poisoned Host 202
[C6] issued link host after poison attempt {"containsEvil":false,"containsConfigured":true}
[C7] forgot re-issued purpose for INVITED acct {"subject":"You have been invited to the Service Delivery Portal"}
[C8] set-password with invite token 422
[C9] reuse same token after success (single-use) {"status":422,"code":"PASSWORD_PERSONAL"}
[C10] forgot-password known vs unknown {"known":[202,408],"unknown":[202,413]}
[C11] previous reset link after a new forgot-password (invalidated?) {"tokenChanged":true,"oldStatus":"invalid"}
[C12] forgot-password after several requests (per-email limit) {"status":429,"code":"RATE_LIMITED"}
[C13] validate empty token invalid
[C14] validate oversized token (len 5000) undefined
[C15] validate wrong-but-valid-shape token invalid
[C16] any API response leaked a token false
[C17] cleanup delete victim 403
```

## single-use (p3b)
```
[D1] create invited account 201
[D2] concurrent double submit statuses [200,400]
[D3] exactly one succeeded 0
[D4] validate consumed token invalid
[D5] reuse consumed token 400
[D6] login with freshly set password 200
[D7] weak password rejected null
[D7] policy short {"status":422,"code":"PASSWORD_POLICY"}
[D7] policy no-digit {"status":422,"code":"PASSWORD_POLICY"}
[D7] policy common {"status":422,"code":"PASSWORD_PERSONAL"}
[D8] cleanup delete vapt.single. 204
[D8] cleanup delete vapt.pol.374 204
```

## authz (p4)
```
[E1] devA created draft true
[E2] devB GET devA draft 404
[E3] devB PATCH devA task 403
[E4] devB submit devA task 403
[E5] devB add attachment to devA task 403
[E6] devB DELETE devA task 403
[E7] devB GET devA checklist 404
[E8] devB GET devA events 404
[E9] reviewer GET devA DRAFT (not yet submitted) 404
[E10] admin GET devA DRAFT 404
[E11] reviewer GET devA DRAFT review 403
[E12] admin GET devA DRAFT review (H-11 consistency) 204
[E13] dev POST /users (admin only) 403
[E14] dev GET /users 403
[E15] dev GET /audit-logs 403
[E16] reviewer POST /users 403
[E17] reviewer PATCH /checklist-sections create (admin) 403
[E18] admin DELETE user (super-admin only) 403
[E19] admin POST transfer-super-admin 403
[E20] dev GET /system-audit-events (super only) 403
[E21] admin GET /system-audit-events 403
[E22] reviewer GET submitted devA task (open pool) 200
[E23] reviewer picks task 200
[E24] reviewer2 picks already-picked task (concurrency/BOLA) 409
[E25] reviewer2 saves draft on rev1-owned review (BOLA) 403
[E26] reviewer2 decides on rev1-owned review (BOLA) 403
[E27] devA (owner) picks own submitted task as reviewer? dev has no reviewer role 403
[E28] mark-read random uuid 404
[E29] dev marks super-admin notification read (cross-user) 403
[E30] reviewer GET /customers 200
[E31] dev POST /customers (admin only) 403
[E32] admin cancel task 200
```

## workflow (p5)
```
[F1] create with privileged extra fields {"status":400,"code":"VALIDATION_FAILED"}
[F2] PATCH with status/cycle fields {"status":400,"code":"VALIDATION_FAILED"}
[F3] reviewer decide before pick (no assignment) 403
[F4] reviewer saveDraft before pick 403
[F5] dev submits an already-submitted task 409
[F6] concurrent submit statuses [200,200]
[F7] status-history SUBMITTED entries after concurrent submit (want 1) {"historyRows":3,"submitLike":2}
[F8] concurrent approve statuses [200,200]
[F9] completed/approved review forms after double approve (want 1) {"totalForms":2,"completed":0}
[F10] TASK_APPROVED audit entries for this task 2
[F11] decide with injected counted/excludedAt fields 422
[F12] counted cycle after injected exclusion (want 1) {}
[F13] task Y finding id captured true
[F14] rev references task-Y finding id with wrong text on task X {"status":403,"code":"FORBIDDEN"}
[F15] rev references task-Y finding id with the correct text {"status":200}
[F16] task Y finding text unchanged / not cross-written {"text":"SECRET FINDING TEXT"}
```

## race-detail (p5b)
```
[G1] 3x concurrent approve statuses [200,200,409]
[G2] review forms (id, status, decision, completedAt) [{"dec":"Approved","done":false},{"dec":"Approved","done":false}]
[G3] developer approval notifications (before/after/approved-count) {"before":8,"after":9,"approvedNotifs":0}
[G4] final task status / currentReviewCycle {"status":"Approved"}
```

## uploads (p6)
```
[H] svg {"status":415,"code":"UNSUPPORTED_MEDIA_TYPE"}
[H] svgPlain {"status":422,"code":"ATTACHMENT_REJECTED"}
[H] jsScheme {"status":422,"code":"ATTACHMENT_REJECTED"}
[H] htmlAsPng {"status":415,"code":"UNSUPPORTED_MEDIA_TYPE"}
[H] pngMimeWrongBytes {"status":415,"code":"UNSUPPORTED_MEDIA_TYPE"}
[H] remoteUrl {"status":422,"code":"ATTACHMENT_REJECTED"}
[H] realPng {"status":201,"code":"ACCEPTED"}
[H] oversized >5MB {"status":413,"code":"PAYLOAD_TOO_LARGE"}
[H] path-traversal filename stored (status) {"status":500}
[H] stored filenames ["realPng.png"]
```

## nul-byte (p6b)
```
NUL byte only: 500 {"statusCode":500,"code":"INTERNAL_ERROR","message":"An unexpected server error occurred","details":[],"timestamp":"2026-10-11T14:57:16.968Z"}
traversal no-NUL: 201 [{"id":"dbcced78-80e2-47b7-ba77-23a138a78d7f","taskId":"52e76828-2393-4661-883c-cefa7d3e49ae","fileName":"../../etc/pass
NUL in caption: 500
```

## prod-config (env)
```
ACCEPTED   prod baseline
REJECTED   no sslmode :: Invalid environment configuration: [ { "code": "custom", "path": [ "DATABASE_URL
REJECTED   COOKIE_SECURE=false :: Invalid environment configuration: [ { "code": "custom", "path": [ "COOKIE_SECUR
REJECTED   http FRONTEND_ORIGIN :: Invalid environment configuration: [ { "code": "custom", "path": [ "FRONTEND_ORI
REJECTED   http APP_BASE_URL :: Invalid environment configuration: [ { "code": "custom", "path": [ "APP_BASE_URL
REJECTED   EMAIL_ENABLED=false :: Invalid environment configuration: [ { "code": "custom", "path": [ "EMAIL_ENABLE
REJECTED   E2E_MAIL_OUTBOX set :: Invalid environment configuration: [ { "code": "custom", "path": [ "E2E_MAIL_OUT
REJECTED   TRUST_PROXY=true :: Invalid environment configuration: [ { "code": "custom", "path": [ "TRUST_PROXY"
REJECTED   short JWT secret :: Invalid environment configuration: [ { "origin": "string", "code": "too_small", 
REJECTED   missing JWT secret :: Invalid environment configuration: [ { "code": "custom", "path": [ "JWT_ACCESS_S
```

