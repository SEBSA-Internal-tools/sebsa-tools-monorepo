-- Version each staged profile edit so employee resubmissions and reviewer actions use
-- compare-and-swap semantics. The pending change remains a single JSON snapshot on profiles,
-- so a resubmission replaces that snapshot instead of creating another approval row.
alter table public.profiles
  add column if not exists pending_change_version uuid;

update public.profiles
set pending_change_version = gen_random_uuid()
where pending_change is not null and pending_change_version is null;

-- The existing self-update policy identifies the correct published row, but RLS cannot express
-- "only these columns changed". Enforce that invariant in the database so the approved/live
-- columns cannot be bypassed with a direct PostgREST update.
create or replace function public.enforce_employee_pending_change_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
    and public.current_user_role() = 'employee'
    and old.user_id = auth.uid()
    and old.status = 'published'
    and (
      to_jsonb(new) - array['pending_change', 'pending_change_submitted_at', 'pending_change_version']::text[]
    ) is distinct from (
      to_jsonb(old) - array['pending_change', 'pending_change_submitted_at', 'pending_change_version']::text[]
    )
  then
    raise exception 'Published profile fields must be submitted for review.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_employee_pending_change_only on public.profiles;
create trigger profiles_employee_pending_change_only
before update on public.profiles
for each row execute function public.enforce_employee_pending_change_only();

create or replace view public.pending_review_items
with (security_invoker = true)
as
  select id as profile_id, full_name, email, 'new_profile'::text as item_type,
    created_at as submitted_at, null::jsonb as proposed_change,
    null::uuid as pending_version
  from public.profiles where status = 'draft' and deleted_at is null
  union all
  select id, full_name, email, 'claim'::text, created_at, null::jsonb,
    null::uuid
  from public.profiles where pending_claim_user_id is not null and deleted_at is null
  union all
  select id, full_name, email, 'change'::text,
    coalesce(pending_change_submitted_at, created_at), pending_change,
    pending_change_version
  from public.profiles where pending_change is not null and deleted_at is null;

revoke all on public.pending_review_items from anon, authenticated;
grant select on public.pending_review_items to service_role;
