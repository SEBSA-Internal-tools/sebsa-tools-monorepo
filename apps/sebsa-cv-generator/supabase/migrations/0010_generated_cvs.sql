create table if not exists generated_cvs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  opportunity_id uuid references opportunities(id) on delete set null,
  template_id uuid not null references templates(id),
  status text not null default 'draft' check (status in ('draft', 'in_review', 'approved', 'exported')),
  content jsonb not null default '{}',
  ai_highlights jsonb not null default '{}',
  ai_provider text,
  ai_model text,
  version int not null default 1,
  parent_generated_cv_id uuid references generated_cvs(id) on delete set null,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists generated_cvs_profile_idx on generated_cvs (profile_id);
create index if not exists generated_cvs_opportunity_idx on generated_cvs (opportunity_id);
create index if not exists generated_cvs_status_idx on generated_cvs (status);
