# Database Schema

Postgres via Supabase. This is the canonical design; the actual migration files created in
Phase 2 ([06-phase-plan.md](./06-phase-plan.md)) implement exactly this.

## 1. Entity overview

```
auth.users (Supabase-managed)
  └─ user_roles (1:1)              — RBAC role per user
  └─ profiles (1:1, optional)       — an auth user MAY be linked to an employee profile

departments (lookup)
  └─ profiles (1:N)

profiles                            — one row per employee CV
  ├─ experiences (1:N)
  ├─ projects (1:N)
  ├─ certifications (1:N)
  └─ profile_skills (N:N via skills)

skills (lookup, shared master list)
  └─ profile_skills (junction)

opportunities                       — customer requirement, reusable
templates                           — branded CV templates
generated_cvs                       — AI-customized CV output
  ├─ profile_id  → profiles
  ├─ opportunity_id → opportunities (nullable)
  └─ template_id → templates

files                               — Storage object metadata (original + exported files)
audit_logs                          — append-only action trail
app_settings                        — singleton company/brand config
notification_preferences            — per-user notification toggles
```

## 2. Tables

### `user_roles`

| column     | type                                                                                       | notes |
| ---------- | ------------------------------------------------------------------------------------------ | ----- |
| id         | uuid pk default gen_random_uuid()                                                          |       |
| user_id    | uuid not null unique references auth.users(id) on delete cascade                           |       |
| role       | text not null check (role in ('admin','employee')) |       |
| created_at | timestamptz not null default now()                                                         |       |
| updated_at | timestamptz not null default now()                                                         |       |

Index: `user_id` (unique, already covers lookups).

### `departments`

| column      | type                               | notes |
| ----------- | ---------------------------------- | ----- |
| id          | uuid pk default gen_random_uuid()  |       |
| name        | text not null unique               |       |
| description | text                               |       |
| created_at  | timestamptz not null default now() |       |

### `profiles`

| column              | type                                                                                 | notes                                                         |
| ------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| id                  | uuid pk default gen_random_uuid()                                                    |                                                               |
| user_id             | uuid unique references auth.users(id) on delete set null                             | nullable — set only for self-service employees               |
| full_name           | text not null                                                                        |                                                               |
| email               | text not null                                                                        |                                                               |
| phone               | text                                                                                 |                                                               |
| role_title          | text                                                                                 | e.g. "Senior Backend Engineer"                                |
| specialty           | text                                                                                 |                                                               |
| location            | text                                                                                 |                                                               |
| department_id       | uuid references departments(id) on delete set null                                   |                                                               |
| years_experience    | numeric(4,1)                                                                         | structured, replaces free-text "8+ Years"                     |
| summary             | text                                                                                 | professional summary                                          |
| avatar_url          | text                                                                                 | Storage public URL or external                                |
| availability_status | text not null default 'available' check (in ('available','allocated','unavailable')) |                                                               |
| original_cv_file_id | uuid references files(id) on delete set null                                         |                                                               |
| education           | text                                                                                 | single free-text field, matches the original mock shape       |
| status              | text not null default 'draft' check (status in ('draft','published','archived'))     | manual-review gate before it appears in searchable repository |
| created_by          | uuid references auth.users(id)                                                       |                                                               |
| updated_by          | uuid references auth.users(id)                                                       |                                                               |
| deleted_at          | timestamptz                                                                          | null for active profiles; set when a profile is soft-deleted  |
| deleted_by          | uuid references auth.users(id) on delete set null                                    | administrator who soft-deleted the profile                    |
| created_at          | timestamptz not null default now()                                                   |                                                               |
| updated_at          | timestamptz not null default now()                                                   |                                                               |

Indexes: `department_id`, `status`, active-profile `full_name`, full-text search index:
`create index profiles_search_idx on profiles using gin (to_tsvector('english', full_name || ' ' || coalesce(role_title,'') || ' ' || coalesce(summary,'')))`.

### `experiences`

| column          | type                                                    | notes            |
| --------------- | ------------------------------------------------------- | ---------------- |
| id              | uuid pk default gen_random_uuid()                       |                  |
| profile_id      | uuid not null references profiles(id) on delete cascade |                  |
| company         | text not null                                           |                  |
| role_title      | text not null                                           |                  |
| employment_type | text                                                    | e.g. "Full-time" |
| start_date      | date                                                    |                  |
| end_date        | date                                                    | null = current   |
| period_text     | text                                                    | exact source period; preserves partial dates such as `Jun 2020` |
| is_current      | boolean not null default false                          |                  |
| description     | text                                                    |                  |
| display_order   | int not null default 0                                  |                  |
| created_at      | timestamptz not null default now()                      |                  |

Index: `profile_id`.

### `projects`

| column        | type                                                    | notes |
| ------------- | ------------------------------------------------------- | ----- |
| id            | uuid pk default gen_random_uuid()                       |       |
| profile_id    | uuid not null references profiles(id) on delete cascade |       |
| name          | text not null                                           |       |
| description   | text                                                    |       |
| tags          | text[] not null default '{}'                            |       |
| display_order | int not null default 0                                  |       |
| created_at    | timestamptz not null default now()                      |       |

Index: `profile_id`.

### `certifications`

| column         | type                                                    | notes |
| -------------- | ------------------------------------------------------- | ----- |
| id             | uuid pk default gen_random_uuid()                       |       |
| profile_id     | uuid not null references profiles(id) on delete cascade |       |
| name           | text not null                                           |       |
| issuer         | text                                                    |       |
| issued_date    | date                                                    |       |
| expiry_date    | date                                                    |       |
| credential_url | text                                                    |       |
| created_at     | timestamptz not null default now()                      |       |

Index: `profile_id`.

### `skills` / `profile_skills`

```sql
skills: id uuid pk, name text not null unique, category text, created_at timestamptz default now()

profile_skills:
  profile_id uuid not null references profiles(id) on delete cascade,
  skill_id   uuid not null references skills(id) on delete cascade,
  proficiency text check (proficiency in ('beginner','intermediate','advanced','expert')),
  primary key (profile_id, skill_id)
```

Index: `skill_id` (for "find employees with skill X" filter queries).

### `opportunities`

| column                    | type                                                                 | notes                                          |
| ------------------------- | -------------------------------------------------------------------- | ---------------------------------------------- |
| id                        | uuid pk default gen_random_uuid()                                    |                                                |
| customer_name             | text not null                                                        |                                                |
| project_name              | text not null                                                        |                                                |
| title                     | text                                                                 |                                                |
| required_skills           | text[] not null default '{}'                                         |                                                |
| required_experience_years | numeric(4,1)                                                         |                                                |
| industry_domain           | text                                                                 |                                                |
| key_competencies          | jsonb not null default '[]'                                          |                                                |
| preferred_certifications  | jsonb not null default '[]'                                          |                                                |
| keywords                  | text[] not null default '{}'                                         |                                                |
| mandatory_requirements    | jsonb not null default '[]'                                          |                                                |
| raw_extracted_text        | text                                                                 | full text extracted from the uploaded document |
| original_file_id          | uuid references files(id) on delete set null                         |                                                |
| status                    | text not null default 'draft' check (status in ('draft','reviewed')) | manual-review gate                             |
| created_by                | uuid references auth.users(id)                                       |                                                |
| created_at                | timestamptz not null default now()                                   |                                                |
| updated_at                | timestamptz not null default now()                                   |                                                |

Index: `customer_name`, gin index on `required_skills`.

### `templates`

| column        | type                               | notes                                     |
| ------------- | ---------------------------------- | ----------------------------------------- |
| id            | uuid pk default gen_random_uuid()  |                                           |
| name          | text not null                      |                                           |
| description   | text                               |                                           |
| thumbnail_url | text                               |                                           |
| branding      | jsonb not null default '{}'        | colors, logo_url, fonts                   |
| layout_config | jsonb not null default '{}'        | section order/visibility defaults         |
| is_active     | boolean not null default true      | soft delete / hide without losing history |
| created_by    | uuid references auth.users(id)     |                                           |
| created_at    | timestamptz not null default now() |                                           |
| updated_at    | timestamptz not null default now() |                                           |

### `generated_cvs`

| column                 | type                                                                                        | notes                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| id                     | uuid pk default gen_random_uuid()                                                           |                                                                                                                         |
| profile_id             | uuid not null references profiles(id) on delete cascade                                     |                                                                                                                         |
| opportunity_id         | uuid references opportunities(id) on delete set null                                        |                                                                                                                         |
| template_id            | uuid not null references templates(id)                                                      |                                                                                                                         |
| status                 | text not null default 'draft' check (status in ('draft','in_review','approved','exported')) |                                                                                                                         |
| content                | jsonb not null                                                                              | full structured, customized CV (sections, summary, ordered experience, etc.)                                            |
| ai_highlights          | jsonb not null default '{}'                                                                 | per-field provenance: which fields/sections were AI-reordered or emphasized, drives the UI's`.ai-highlight` indicator |
| ai_provider            | text                                                                                        | e.g. 'gemini'                                                                                                           |
| ai_model               | text                                                                                        | e.g. 'gemini-2.5-pro'                                                                                                   |
| version                | int not null default 1                                                                      |                                                                                                                         |
| parent_generated_cv_id | uuid references generated_cvs(id) on delete set null                                        | set when the user regenerates                                                                                           |
| created_by             | uuid references auth.users(id)                                                              |                                                                                                                         |
| updated_by             | uuid references auth.users(id)                                                              |                                                                                                                         |
| created_at             | timestamptz not null default now()                                                          |                                                                                                                         |
| updated_at             | timestamptz not null default now()                                                          |                                                                                                                         |

Indexes: `profile_id`, `opportunity_id`, `status`.

### `files`

| column              | type                                                                         | notes |
| ------------------- | ---------------------------------------------------------------------------- | ----- |
| id                  | uuid pk default gen_random_uuid()                                            |       |
| bucket              | text not null check (bucket in ('original-cvs','generated-cvs'))             |       |
| storage_path        | text not null                                                                |       |
| original_filename   | text not null                                                                |       |
| mime_type           | text                                                                         |       |
| size_bytes          | bigint                                                                       |       |
| related_entity_type | text check (related_entity_type in ('profile','opportunity','generated_cv')) |       |
| related_entity_id   | uuid                                                                         |       |
| uploaded_by         | uuid references auth.users(id)                                               |       |
| created_at          | timestamptz not null default now()                                           |       |

Index: `(related_entity_type, related_entity_id)`.

### `audit_logs`

| column      | type                                              | notes                                                                              |
| ----------- | ------------------------------------------------- | ---------------------------------------------------------------------------------- |
| id          | uuid pk default gen_random_uuid()                 |                                                                                    |
| actor_id    | uuid references auth.users(id) on delete set null |                                                                                    |
| action      | text not null                                     | e.g. 'cv_uploaded', 'cv_generated', 'cv_exported', 'profile_updated', 'user_login' |
| entity_type | text                                              |                                                                                    |
| entity_id   | uuid                                              |                                                                                    |
| metadata    | jsonb not null default '{}'                       |                                                                                    |
| created_at  | timestamptz not null default now()                |                                                                                    |

Index: `created_at desc`, `actor_id`, `action`.

### `app_settings` (singleton)

| column             | type                               | notes               |
| ------------------ | ---------------------------------- | ------------------- |
| id                 | int pk default 1 check (id = 1)    | enforces single row |
| company_name       | text                               |                     |
| industry           | text                               |                     |
| brand_colors       | jsonb not null default '[]'        |                     |
| active_template_id | uuid references templates(id)      |                     |
| updated_at         | timestamptz not null default now() |                     |

### `notification_preferences`

| column               | type                                                | notes |
| -------------------- | --------------------------------------------------- | ----- |
| user_id              | uuid pk references auth.users(id) on delete cascade |       |
| email_digests        | boolean not null default true                       |       |
| new_generation_alert | boolean not null default true                       |       |
| system_updates       | boolean not null default false                      |       |
| updated_at           | timestamptz not null default now()                  |       |

## 3. Storage buckets

| bucket            | public  | purpose                                    |
| ----------------- | ------- | ------------------------------------------ |
| `original-cvs`  | private | raw uploaded employee CV files (PDF/DOCX)  |
| `generated-cvs` | private | exported PDF/DOCX output of customized CVs |

Both private; access is brokered through signed URLs generated server-side after an RLS/role
check, never via public bucket URLs — even "generated-cvs" stays private since exports may
contain client-confidential opportunity framing.

## 4. Migration file layout (created in Phase 2)

```
supabase/migrations/
  0001_extensions.sql
  0002_user_roles.sql
  0003_departments.sql
  0004_files.sql                                  # created before profiles/opportunities, which FK into it
  0005_profiles.sql
  0006_experiences_projects_certifications.sql
  0007_skills.sql
  0008_opportunities.sql
  0009_templates.sql
  0010_generated_cvs.sql
  0011_audit_logs.sql
  0012_settings.sql
  0013_rls_policies.sql
  0014_storage_buckets.sql
```
