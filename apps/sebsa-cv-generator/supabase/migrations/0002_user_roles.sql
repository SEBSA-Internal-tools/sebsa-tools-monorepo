create table if not exists user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'employee')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- security definer so RLS policies can call this without recursing back into user_roles' own
-- RLS (see docs/04-rbac-security.md §3).
create or replace function public.current_user_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from user_roles where user_id = auth.uid()
$$;

-- Every new auth user gets an 'employee' row automatically; promote to 'admin' manually via
--   update user_roles set role = 'admin' where user_id = '<uuid>';
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_roles (user_id, role) values (new.id, 'employee');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
