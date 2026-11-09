create table if not exists opportunities (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  project_name text not null,
  title text,
  required_skills text[] not null default '{}',
  required_experience_years numeric(4, 1),
  industry_domain text,
  key_competencies jsonb not null default '[]',
  preferred_certifications jsonb not null default '[]',
  keywords text[] not null default '{}',
  mandatory_requirements jsonb not null default '[]',
  raw_extracted_text text,
  original_file_id uuid references files(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'reviewed')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists opportunities_customer_idx on opportunities (customer_name);
create index if not exists opportunities_required_skills_idx on opportunities using gin (required_skills);
