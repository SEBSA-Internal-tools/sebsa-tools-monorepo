-- Brings a database built from migrations 0001-0031 in line with PRODUCTION, which had drifted:
-- a few changes were applied to production directly and never committed as migrations. Verified by
-- comparing a schema rebuilt from migrations against a pg_dump of production (2026-10-22).
--
-- IDEMPOTENT and safe to run on production, where every statement is already satisfied and
-- therefore does nothing. Its purpose is a fresh database (a new developer, the shared dev project,
-- CI) that behaves like production.
--
-- 1. Soft delete on profiles (added directly in production by a co-developer).
-- 2. certifications: production does not have expiry_date / credential_url, which 0006 created and
--    nothing in the application reads.
-- 3. profiles_admin_delete is absent in production (profiles are soft-deleted, not hard-deleted).
--
-- Deliberately NOT reconciled:
--   * public.rls_auto_enable() event trigger: a Supabase platform setting ("Automatically enable
--     RLS"), enabled when a project is created, not part of the app schema.
--   * audit_logs_entity_idx (0028) is missing in production; keeping it is harmless and intended.

-- 1. Soft delete -------------------------------------------------------------------------------
alter table profiles add column if not exists deleted_at timestamptz;
alter table profiles add column if not exists deleted_by uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_deleted_by_fkey') then
    alter table profiles
      add constraint profiles_deleted_by_fkey foreign key (deleted_by) references auth.users(id) on delete set null;
  end if;
end $$;

create index if not exists profiles_active_name_idx on profiles (full_name) where (deleted_at is null);

-- Policies exactly as in production: every read/update path ignores soft-deleted rows.
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select using (
  deleted_at is null and (is_reviewer_or_above() or user_id = auth.uid())
);

drop policy if exists profiles_self_claim_request on profiles;
create policy profiles_self_claim_request on profiles for update
  using (deleted_at is null and current_user_role() = 'employee' and user_id is null and email = auth.email())
  with check (deleted_at is null and user_id is null and pending_claim_user_id = auth.uid());

drop policy if exists profiles_self_claimable_select on profiles;
create policy profiles_self_claimable_select on profiles for select
  using (deleted_at is null and current_user_role() = 'employee' and user_id is null and email = auth.email());

drop policy if exists profiles_self_propose_change on profiles;
create policy profiles_self_propose_change on profiles for update
  using (deleted_at is null and current_user_role() = 'employee' and user_id = auth.uid() and status = 'published')
  with check (deleted_at is null and user_id = auth.uid() and status = 'published');

drop policy if exists profiles_self_update_draft on profiles;
create policy profiles_self_update_draft on profiles for update
  using (deleted_at is null and current_user_role() = 'employee' and user_id = auth.uid() and status = 'draft')
  with check (deleted_at is null and current_user_role() = 'employee' and user_id = auth.uid() and status = 'draft');

-- 3. No hard delete of profiles through RLS --------------------------------------------------------
drop policy if exists profiles_admin_delete on profiles;

-- 2. certifications ----------------------------------------------------------------------------
alter table certifications drop column if exists expiry_date;
alter table certifications drop column if exists credential_url;
