# Architecture

## 1. High-level shape

```
Browser (existing Tailwind/React UI, largely unchanged)
        │
        ▼
Next.js App Router
  ├─ Server Components  ── read data (profiles, opportunities, generated_cvs, ...)
  ├─ Server Actions      ── mutate data (create/update/delete, form submits)
  ├─ Route Handlers      ── file upload + parsing + AI endpoints, exports
  └─ proxy.ts             ── Supabase session refresh + route protection (RBAC gate)
        │
        ▼
lib/
  ├─ supabase/    (client factories: browser, server, admin/service-role)
  ├─ ai/          (provider-agnostic AI interface: gemini.ts active, claude.ts future)
  ├─ parsing/     (PDF/DOCX/text extraction helpers)
  ├─ export/      (PDF/DOCX generation from a generated CV record)
  └─ env.ts       (typed, validated env var access)
        │
        ▼
services/   (business logic: EmployeeService, OpportunityService, CvGenerationService, ...)
repositories/  (thin Supabase query layer per table/aggregate)
        │
        ▼
Supabase (Postgres + RLS, Auth, Storage)
```

`types/` holds shared TypeScript types, including the generated Supabase `Database` type
(`supabase gen types typescript`) produced once the schema in
[03-database-schema.md](./03-database-schema.md) is migrated.

## 2. Why Server Components / Server Actions / Route Handlers, not Express

Next.js App Router already provides everything an Express layer would (routing, middleware,
streaming, edge/node runtimes). Introducing Express would mean running two servers, duplicating
auth/session handling, and losing React Server Component data-fetching for no benefit. Route
Handlers (`app/api/**/route.ts`) are used only where a non-page HTTP endpoint is genuinely needed
(file upload, AI calls, exports) — everything else is a Server Component or Server Action.

## 3. Folder structure (new, additive to existing `app/`)

```
lib/
  supabase/
    client.ts        # browser client (anon key) — for Client Components that need it
    server.ts         # server client (cookies-based) — for Server Components/Actions
    admin.ts           # service-role client — Route Handlers only, never exposed to browser
  ai/
    types.ts           # EmployeeProfileExtraction, RequirementExtraction, CustomizedCv, etc.
    provider.ts         # AIProvider interface + getAIProvider() factory
    gemini.ts            # active implementation
    claude.ts             # future implementation, same interface, not wired as default
  parsing/
    pdf.ts              # PDF → text
    docx.ts              # DOCX → text
  export/
    pdf.tsx              # @react-pdf/renderer document → Buffer
    docx.ts               # docx library document → Buffer
  env.ts                 # process.env access, validated once at import time

types/
  database.ts             # generated from Supabase schema
  domain.ts                # hand-written domain types built on top of database.ts

repositories/
  employee-repository.ts
  opportunity-repository.ts
  template-repository.ts
  generated-cv-repository.ts
  audit-repository.ts

services/
  employee-service.ts        # profile CRUD + orchestration, calls repositories + ai
  opportunity-service.ts
  cv-generation-service.ts
  export-service.ts
  audit-service.ts

proxy.ts                      # session refresh + RBAC route guard (Next.js 16 renamed middleware.ts)
```

`app/` keeps its existing pages, but their bodies switch from `useData()`/local mock state to:
Server Components fetching via `repositories`/`services`, and forms calling **Server Actions**
defined alongside the page (`app/(authenticated)/upload/actions.ts`, etc.) or hitting the
`app/api/*` Route Handlers for the heavier upload/parse/generate/export operations.

## 4. React Context after migration

`app/context/DataContext.tsx` currently holds all "business" data (employees, activities,
settings) as `useState`. Per the task's constraint, Context is UI-state only going forward.
Plan:

- Keep a slim `UiContext` (or reuse the existing provider name) for things like sidebar
  collapse state, toast/notification queue, and the currently-open modal — genuine UI state
  that doesn't belong in the URL or a server round-trip.
- `currentUser` moves to a `getCurrentUser()` Server Component helper backed by
  `supabase.auth.getUser()` + a `user_roles` lookup, passed down as props/read directly in
  Server Components — not stored in Context.
- Everything else currently in `DataContext` (employees, activities, company/notification
  settings) is deleted from Context and replaced by real data fetching per page, as detailed
  per-phase in [06-phase-plan.md](./06-phase-plan.md).

## 5. Request flow example — CV upload

```
Client (Upload page, drag-drop) 
  → POST /api/upload-cv (multipart)
      → lib/parsing/{pdf,docx}.ts: extract raw text
      → Supabase Storage: save original file to `original-cvs` bucket
      → lib/ai/provider.ts → extractEmployeeProfile(rawText)
      → repositories/employee-repository.ts: insert draft profile (status='draft')
      → services/audit-service.ts: log "cv_uploaded"
  ← 200 { profileId, extractedData }
Client renders the existing "AI parsed" review form (unchanged UI), pre-filled with real
extracted data instead of the hardcoded "Sarah Chen" stub.
On manual review submit → Server Action updates the profile and flips status to 'published'.
```

## 6. Deployment

Vercel, Next.js App Router defaults. Supabase project (hosted). Environment variables set in
Vercel project settings mirroring `.env.local` (see [06-phase-plan.md](./06-phase-plan.md) Phase 1).
No Express, no custom server, no Vite — pure `next build` / `next start` (or Vercel's managed
build).
