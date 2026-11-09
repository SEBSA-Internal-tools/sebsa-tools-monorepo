create table if not exists skills (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text,
  created_at timestamptz not null default now()
);

create table if not exists profile_skills (
  profile_id uuid not null references profiles(id) on delete cascade,
  skill_id uuid not null references skills(id) on delete cascade,
  proficiency text check (proficiency in ('beginner', 'intermediate', 'advanced', 'expert')),
  primary key (profile_id, skill_id)
);
create index if not exists profile_skills_skill_idx on profile_skills (skill_id);
