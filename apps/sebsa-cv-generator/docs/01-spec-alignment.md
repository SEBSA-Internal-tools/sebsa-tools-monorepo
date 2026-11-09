# Spec Alignment — Functional Spec vs. Implementation Plan

Source: `CV-Generator_Functional_Spec.docx` ("Employee CV Customization & Management Platform").
This document reconciles that spec against the original task instructions and the actual
mock codebase, and records where the plan was refactored and why.

## 1. Roles — confirmed match

The spec's role table (unnamed row labels inferred from descriptions) lines up exactly with
the RBAC roles requested:

| Spec description                                                        | Role name used     |
| ----------------------------------------------------------------------- | ------------------ |
| Manages platform configuration, users, roles, and templates, Maintains the employee CV repository and profile data, Primary user for generating customized CVs for customer opportunities           | **Admin**    |
| "May view and request updates to their own profile" (future-ready)      | **Employee** |

No changes needed here. See [04-rbac-security.md](./04-rbac-security.md) for the permission matrix.

## 2. Auth — spec says SSO, task instructions say email/password now

Spec: *"The system shall enforce authentication via SEBSA's corporate identity provider (single sign-on)."*
Task instructions: *"We DO NOT currently have Microsoft SSO... Use Supabase Email/Password authentication... Design authentication so OAuth providers can be plugged in later."*

**Resolution:** Build on Supabase Auth with email/password now. Supabase Auth's OAuth provider
config is additive (add an Azure AD provider in the Supabase dashboard + one `signInWithOAuth`
call) so this satisfies the spec's end-state without blocking the MVP. No further action needed
beyond keeping the login page provider-agnostic (already true — see [02-architecture.md](./02-architecture.md)).

## 3. AI provider — spec is silent, task instructions conflict with themselves

The task brief says to prefer Gemini/Groq during development via a provider abstraction, but the
Phase 1 "output format" section at the end of the same message lists `CLAUDE_API_KEY` in the
`.env.local` example.

**Resolution:** Active provider for development is **Gemini** (`GEMINI_API_KEY`, `AI_PROVIDER=gemini`).
`claude.ts` ships as a real implementation of the same interface but is not wired as the active
provider until an Anthropic key exists — `CLAUDE_API_KEY` stays in `.env.local.example` as a
reserved, currently-unused variable so swapping providers later is a one-line env change, not a
code change. See [05-ai-provider-abstraction.md](./05-ai-provider-abstraction.md).

## 4. Phase plan — two conflicting lists in the brief, reconciled into one

The task brief contains two different phase breakdowns (a 10-phase high-level list, and a
9-phase list with concrete file paths) that don't map 1:1 to each other — e.g. the second list
merges "Dashboard" into "Frontend Database Integration" and merges "Preview/Editing" with
"Export", while the first list keeps them separate; the second list's Phase 4 also references
calling Claude directly, which conflicts with the provider-abstraction requirement.

**Resolution:** [06-phase-plan.md](./06-phase-plan.md) defines a single reconciled 11-phase plan
that preserves every deliverable from both lists, keeps the AI provider abstraction intact
end-to-end, and adds an explicit "Foundations" phase (env/deps/lib scaffolding) before the
database migration phase, since the codebase currently has zero `lib/`, `types/`, or `proxy.ts`
to build on.

## 5. Scope items confirmed present in both spec and mock UI

These spec requirements already have a corresponding (currently mocked) UI surface, confirmed by
the codebase survey — no new pages need to be designed, only real data/logic behind them:

- Employee CV Repository upload/search/filter → `/upload`, `/repository`, `/repository/[id]`
- Employee Dashboard → `/dashboard`
- Requirement upload & AI customization → `/generate`
- Multiple branded templates → `/templates`
- Preview/edit before export → `/repository/[id]` and `/generate` output panel
- Admin config, templates, audit, users → `/settings`

## 6. Gaps the mock UI has that the spec requires but aren't wired to anything

Found during the codebase survey — these need new tables/logic, not new screens:

- **Templates as data**: `/templates` page is a single hardcoded resume, not connected to any
  list of selectable branded templates. `/settings` has a separate hardcoded `templatesList`.
  These converge into one real `templates` table (Phase 8).
- **Admin user/role management**: `/settings` had a hardcoded `adminUsersList` — resolved on the
  `feature/update-rbac` branch, which wires the "User Access & Team Controls" card to real
  `user_roles` data with a working role-change control. That same branch also widened the role
  model from Admin/Employee to the four roles (Super Admin, Admin, CV Reviewer, Employee) defined
  in `SEBSA_Access_Control_Retention_Privacy_Protocol.docx` — see
  [04-rbac-security.md](./04-rbac-security.md) §0 for exactly what was and wasn't implemented
  from that document (the maker-checker/retention/disposal workflow it also describes is a much
  larger effort, deliberately deferred to a future phase).
- **Opportunities are fully ephemeral**: `/generate` never persists the customer requirement it
  parses — spec requires reuse across multiple employee generations for the same opportunity
  (Phase 6).
- **No real audit trail**: `Activity` objects in `DataContext` are seeded, in-memory only, and use
  fabricated relative timestamps (`"2 mins ago"`) instead of real `created_at` values (Phase 11).
- **AI-emphasis indicator**: spec requires *"a visible indicator distinguishing AI-emphasized/
  reordered content from the original source data"* — the mock's `.ai-highlight` /
  `.ai-dashed-border` CSS classes already exist in `globals.css` unused; Phase 7 wires real
  per-field provenance metadata (`ai_highlights` jsonb on `generated_cvs`) into them.
