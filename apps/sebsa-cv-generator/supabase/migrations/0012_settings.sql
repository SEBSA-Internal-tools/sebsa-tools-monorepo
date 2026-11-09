create table if not exists app_settings (
  id int primary key default 1 check (id = 1),
  company_name text,
  industry text,
  brand_colors jsonb not null default '[]',
  active_template_id uuid references templates(id),
  updated_at timestamptz not null default now()
);
insert into app_settings (id) values (1) on conflict (id) do nothing;

create table if not exists notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email_digests boolean not null default true,
  new_generation_alert boolean not null default true,
  system_updates boolean not null default false,
  updated_at timestamptz not null default now()
);
