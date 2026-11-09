create table if not exists templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  thumbnail_url text,
  branding jsonb not null default '{}',
  layout_config jsonb not null default '{}',
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
