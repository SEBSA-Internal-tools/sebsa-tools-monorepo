# Implementation Phase Plan (reconciled)

Reconciles the task brief's two conflicting phase lists (see
[01-spec-alignment.md](./01-spec-alignment.md) §4) into one ordered plan. Each phase: explains
what changes and why, lists files to create/modify, ships production-quality code, and **stops
for confirmation** before the next phase starts. Status is tracked here as phases complete.

| # | Phase | Status |
|---|---|---|
| 1 | Foundations — env, deps, lib/ scaffolding | 🔜 next |
| 2 | Database schema — migrations, RLS, storage buckets | ⬜ |
| 3 | Authentication & protected routes | ⬜ |
| 4 | Employee Repository backend (dashboard + repository pages) | ⬜ |
| 5 | CV upload & parsing | ⬜ |
| 6 | Requirement/opportunity upload & parsing | ⬜ |
| 7 | AI CV customization engine | ⬜ |
| 8 | Templates management | ⬜ |
| 9 | Preview, inline editing & export | ⬜ |
| 10 | Settings & admin user management | ⬜ |
| 11 | Audit logs | ⬜ |

## Phase 1 — Foundations
Install `@supabase/supabase-js` + `@supabase/ssr`, PDF/DOCX parsing libs (`pdf-parse`,
`mammoth`), `zod` for env/schema validation. Create `.env.local` (gitignored) +
`.env.local.example` (committed). Scaffold `lib/supabase/*`, `lib/ai/*` (interfaces + types
only — no live calls yet), `lib/env.ts`. No page behavior changes yet; app still runs on mocks.

## Phase 2 — Database schema
Write `supabase/migrations/*.sql` per [03-database-schema.md](./03-database-schema.md): tables,
indexes, FKs, RLS policies, storage bucket creation. Generate `types/database.ts`. Requires a
real Supabase project to actually run against (user provisions and shares the project URL/keys,
or runs the SQL themselves via the Supabase SQL editor / CLI).

## Phase 3 — Authentication & protected routes
Wire `/login` to real `supabase.auth.signInWithPassword`, add `proxy.ts` (Next.js 16's renamed
`middleware.ts` convention) session
refresh + route guard for `/dashboard`, `/repository`, `/upload`, `/generate`, `/templates`,
`/settings`. Replace hardcoded `currentUser` in `DataContext`/`Sidebar`/`Header` with a real
session-derived user + role lookup.

## Phase 4 — Employee Repository backend
Replace `DataContext`'s `employees` array, `addEmployee`/`updateEmployee`/`deleteEmployee` with
`repositories/employee-repository.ts` + `services/employee-service.ts` backed by `profiles` (+
child tables). Wire `/dashboard` and `/repository`/`/repository/[id]` to real queries (search,
filter, pagination replace the fabricated stat widgets and non-functional pagination buttons).

## Phase 5 — CV upload & parsing
`app/api/upload-cv/route.ts`: receive file, extract text (`lib/parsing`), store original in
`original-cvs` bucket, call `getAIProvider().extractEmployeeProfile()`, persist draft profile.
Replace `/upload`'s fake progress simulation and hardcoded "Sarah Chen" prefill with the real
pipeline output and a manual-review-before-publish step.

## Phase 6 — Requirement/opportunity upload & parsing
`app/api/parse-requirement/route.ts`: same pattern for `extractRequirement()`, persisting to
`opportunities` for reuse across multiple generations.

## Phase 7 — AI CV customization engine
`app/api/customize-cv/route.ts`: `generateCustomizedCV()` with the anti-fabrication guardrail
and output validation from [05-ai-provider-abstraction.md](./05-ai-provider-abstraction.md) §4,
persisting to `generated_cvs`. Replace `/generate`'s fake step-wizard and template-string
"tailoring" with real output, wired to the existing `.ai-highlight`/`.ai-dashed-border` CSS via
`ai_highlights`.

## Phase 8 — Templates management
`templates` table + admin CRUD (create/update/deactivate, no code changes needed to add a
template). Unify `/templates` page and `/settings`'s hardcoded `templatesList` into one real
data source; wire template selection into the Phase 7 generation flow.

## Phase 9 — Preview, inline editing & export
Inline edit persistence on `generated_cvs.content` (WYSIWYG touch-ups, blocked from introducing
facts not present in the source profile per spec). Export via `@react-pdf/renderer` (PDF) and
`docx` (DOCX), branded per the selected template, file-named
`EmployeeName_Customer_Project_Date`, uploaded to `generated-cvs` bucket, served via signed URL.
Replaces the `alert()` stub download/print buttons.

## Phase 10 — Settings & admin user management
Wire `/settings` to `app_settings`, `notification_preferences`, and real `user_roles` CRUD
(replacing the hardcoded `adminUsersList`), admin-only per RBAC.

## Phase 11 — Audit logs
`services/audit-service.ts` + `audit_logs` table, called from every mutating action introduced
in Phases 3–10 (login, upload, generate, edit, export, delete). Admin-only audit view/metrics in
`/settings` or a new `/settings/audit` tab, replacing the seeded fake `Activity` feed with real
`created_at`-ordered records.

---
Each phase is implemented only after the previous one is confirmed working, per the task's
"do not implement everything at once" instruction.
