-- Backend-only roster search. Auth emails live in auth.users, so a service-role RPC is required
-- to filter and page before records are returned to the application.
create or replace function public.list_managed_users_page(
  search_text text default '',
  role_filter text default null,
  page_offset integer default 0,
  page_limit integer default 20
)
returns table (
  user_id uuid,
  email text,
  role text,
  created_at timestamptz,
  full_name text,
  avatar_url text,
  total_count bigint
)
language sql
security definer
set search_path = public, auth
as $$
  select ur.user_id, coalesce(au.email, '(deleted user)')::text, ur.role::text,
    ur.created_at, p.full_name, p.avatar_url, count(*) over() as total_count
  from public.user_roles ur
  left join auth.users au on au.id = ur.user_id
  left join public.profiles p on p.user_id = ur.user_id and p.deleted_at is null
  where (role_filter is null or ur.role::text = role_filter)
    and (coalesce(search_text, '') = '' or coalesce(au.email, '') ilike '%' || search_text || '%'
      or coalesce(p.full_name, '') ilike '%' || search_text || '%')
  order by coalesce(au.email, ''), ur.user_id
  offset greatest(page_offset, 0)
  limit least(greatest(page_limit, 1), 100);
$$;

revoke all on function public.list_managed_users_page(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.list_managed_users_page(text, text, integer, integer) to service_role;

create or replace view public.pending_review_items
with (security_invoker = true)
as
  select id as profile_id, full_name, email, 'new_profile'::text as item_type,
    created_at as submitted_at, null::jsonb as proposed_change
  from public.profiles where status = 'draft' and deleted_at is null
  union all
  select id, full_name, email, 'claim'::text, created_at, null::jsonb
  from public.profiles where pending_claim_user_id is not null and deleted_at is null
  union all
  select id, full_name, email, 'change'::text, coalesce(pending_change_submitted_at, created_at), pending_change
  from public.profiles where pending_change is not null and deleted_at is null;

revoke all on public.pending_review_items from anon, authenticated;
grant select on public.pending_review_items to service_role;

create or replace function public.list_assessment_recipients_page(
  cycle_key uuid,
  search_text text default '',
  status_filter text default null,
  page_offset integer default 0,
  page_limit integer default 20
)
returns table (
  user_id uuid, full_name text, email text, tracker_status text,
  invitation_status text, email_status text, email_error text,
  sent_at timestamptz, expires_at timestamptz, attempt_count bigint,
  score integer, submitted_at timestamptz, reminder_status text,
  reminder_error text, total_count bigint
)
language sql security definer set search_path = public, auth as $$
  with recipient_rows as (
    select i.user_id, coalesce(p.full_name, au.email, 'Unknown')::text as full_name,
      coalesce(au.email, '')::text as email,
      case when latest.user_id is not null and not latest.is_final then 'Retry Available'
        when latest.user_id is not null and latest.passed then 'Pass'
        when latest.user_id is not null then 'Fail'
        when i.status <> 'completed' and i.expires_at < now() then 'Expired'
        when i.status = 'opened' then 'In Progress' else 'Not Started' end::text as tracker_status,
      i.status::text invitation_status, i.email_status::text, i.email_error,
      i.sent_at, i.expires_at,
      (select count(*) from public.assessment_attempts a where a.cycle_id = i.cycle_id and a.user_id = i.user_id) attempt_count,
      latest.score, latest.submitted_at, reminder.status::text reminder_status, reminder.last_error reminder_error
    from public.assessment_invitations i
    left join auth.users au on au.id = i.user_id
    left join public.profiles p on p.user_id = i.user_id and p.deleted_at is null
    left join lateral (select a.user_id, a.score, a.submitted_at, a.is_final, a.passed
      from public.assessment_attempts a where a.cycle_id = i.cycle_id and a.user_id = i.user_id
      order by a.attempt_number desc limit 1) latest on true
    left join lateral (select d.status, d.last_error from public.assessment_email_deliveries d
      where d.cycle_id = i.cycle_id and d.user_id = i.user_id and d.email_type = 'reminder'
      order by d.last_attempt_at desc nulls last limit 1) reminder on true
    where i.cycle_id = cycle_key
  ), filtered as (
    select * from recipient_rows where (status_filter is null or tracker_status = status_filter)
      and (coalesce(search_text, '') = '' or full_name ilike '%' || search_text || '%' or email ilike '%' || search_text || '%')
  )
  select f.*, count(*) over() from filtered f
  order by case f.tracker_status when 'Pass' then 0 when 'Fail' then 1 when 'Retry Available' then 2
    when 'In Progress' then 3 when 'Not Started' then 4 else 5 end, f.full_name
  offset greatest(page_offset, 0) limit least(greatest(page_limit, 1), 100);
$$;
revoke all on function public.list_assessment_recipients_page(uuid, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.list_assessment_recipients_page(uuid, text, text, integer, integer) to service_role;

create or replace function public.get_my_assessment_counts()
returns table (completed_count bigint, certificate_count bigint)
language sql security invoker set search_path = public as $$
  select
    (select count(distinct cycle_id) from public.assessment_attempts where user_id = auth.uid() and is_final),
    (select count(*) from public.assessment_certificates c join public.assessment_attempts a on a.id = c.attempt_id where a.user_id = auth.uid());
$$;
revoke all on function public.get_my_assessment_counts() from public, anon;
grant execute on function public.get_my_assessment_counts() to authenticated;

create or replace function public.list_employee_profiles_page(
  search_text text default '', department_key uuid default null, position_filter text default null,
  account_filter text default null, page_offset integer default 0, page_limit integer default 20
)
returns table (
  profile_id uuid, full_name text, display_name text, email text, role_title text,
  years_experience numeric, avatar_url text, updated_at timestamptz, account_user_id uuid,
  department_name text, account_status text, total_count bigint
)
language sql security definer set search_path = public, auth as $$
  with profiles_with_status as (
    select p.id profile_id, p.full_name, p.display_name, p.email, p.role_title,
      p.years_experience, p.avatar_url, p.updated_at, p.user_id account_user_id,
      coalesce(d.name, 'Unassigned')::text department_name,
      case when au.id is null then 'inactive'
        when au.banned_until is not null and au.banned_until > now() then 'deactivated'
        when au.last_sign_in_at is null then 'pending' else 'active' end::text account_status
    from public.profiles p left join public.departments d on d.id = p.department_id
    left join auth.users au on au.id = p.user_id
    where p.status = 'published' and p.deleted_at is null
      and (department_key is null or p.department_id = department_key)
      and (position_filter is null or p.role_title = position_filter)
      and (coalesce(search_text, '') = '' or p.full_name ilike '%' || search_text || '%'
        or coalesce(p.display_name, '') ilike '%' || search_text || '%' or p.email ilike '%' || search_text || '%'
        or coalesce(p.role_title, '') ilike '%' || search_text || '%' or coalesce(d.name, '') ilike '%' || search_text || '%')
  ), filtered as (select * from profiles_with_status where account_filter is null or account_status = account_filter)
  select f.*, count(*) over() from filtered f order by f.full_name, f.profile_id
  offset greatest(page_offset, 0) limit least(greatest(page_limit, 1), 100);
$$;
revoke all on function public.list_employee_profiles_page(text, uuid, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.list_employee_profiles_page(text, uuid, text, text, integer, integer) to service_role;

create or replace function public.list_employee_positions()
returns table (position_name text) language sql security definer set search_path = public as $$
  select distinct role_title from public.profiles
  where status = 'published' and deleted_at is null and role_title is not null
  order by role_title;
$$;
revoke all on function public.list_employee_positions() from public, anon, authenticated;
grant execute on function public.list_employee_positions() to service_role;

create or replace function public.list_invitable_people_page(search_text text default '', page_offset integer default 0, page_limit integer default 20)
returns table (user_id uuid, email text, full_name text, role text, total_count bigint)
language sql security definer set search_path = public, auth as $$
  select au.id, au.email::text, coalesce(p.full_name, split_part(au.email, '@', 1))::text,
    coalesce(ur.role::text, 'employee'), count(*) over()
  from auth.users au left join public.profiles p on p.user_id = au.id and p.deleted_at is null
  left join public.user_roles ur on ur.user_id = au.id
  where au.email is not null and not (au.banned_until is not null and au.banned_until > now())
    and (coalesce(search_text, '') = '' or au.email ilike '%' || search_text || '%'
      or coalesce(p.full_name, '') ilike '%' || search_text || '%' or coalesce(ur.role::text, 'employee') ilike '%' || search_text || '%')
  order by coalesce(p.full_name, au.email), au.id
  offset greatest(page_offset, 0) limit least(greatest(page_limit, 1), 100);
$$;
revoke all on function public.list_invitable_people_page(text, integer, integer) from public, anon, authenticated;
grant execute on function public.list_invitable_people_page(text, integer, integer) to service_role;

create or replace function public.list_assessment_cycle_months()
returns table (month_key text) language sql security invoker set search_path = public as $$
  select distinct to_char(date_trunc('month', opened_at), 'YYYY-MM')
  from public.assessment_cycles order by 1 desc;
$$;
revoke all on function public.list_assessment_cycle_months() from public, anon;
grant execute on function public.list_assessment_cycle_months() to authenticated;
