create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  employee_code text not null unique,
  full_name text not null,
  email text not null,
  phone text,
  role_title text,
  specialty text,
  location text,
  department_id uuid references departments(id) on delete set null,
  years_experience numeric(4, 1),
  summary text,
  avatar_url text,
  availability_status text not null default 'available'
    check (availability_status in ('available', 'allocated', 'unavailable')),
  original_cv_file_id uuid references files(id) on delete set null,
  education text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_department_idx on profiles (department_id);
create index if not exists profiles_status_idx on profiles (status);
create index if not exists profiles_search_idx on profiles using gin (
  to_tsvector('english', full_name || ' ' || coalesce(role_title, '') || ' ' || coalesce(summary, ''))
);
