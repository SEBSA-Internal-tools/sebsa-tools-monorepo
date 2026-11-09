create table if not exists experiences (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  company text not null,
  role_title text not null,
  employment_type text,
  start_date date,
  end_date date,
  is_current boolean not null default false,
  description text,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists experiences_profile_idx on experiences (profile_id);

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  description text,
  tags text[] not null default '{}',
  display_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists projects_profile_idx on projects (profile_id);

create table if not exists certifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  issuer text,
  issued_date date,
  expiry_date date,
  credential_url text,
  created_at timestamptz not null default now()
);
create index if not exists certifications_profile_idx on certifications (profile_id);
