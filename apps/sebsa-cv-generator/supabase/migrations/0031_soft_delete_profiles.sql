-- Preserve employee records and their related CV data when an administrator removes a profile.
alter table profiles
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

create index if not exists profiles_active_name_idx
  on profiles (full_name)
  where deleted_at is null;

-- A soft-deleted profile is no longer part of the active system, including direct API access.
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select using (
  deleted_at is null and (is_reviewer_or_above() or user_id = auth.uid())
);

drop policy if exists profiles_self_claimable_select on profiles;
create policy profiles_self_claimable_select on profiles for select using (
  deleted_at is null
  and current_user_role() = 'employee'
  and user_id is null
  and email = auth.email()
);

drop policy if exists profiles_self_update_draft on profiles;
create policy profiles_self_update_draft on profiles for update using (
  deleted_at is null
  and current_user_role() = 'employee'
  and user_id = auth.uid()
  and status = 'draft'
) with check (
  deleted_at is null
  and current_user_role() = 'employee'
  and user_id = auth.uid()
  and status = 'draft'
);

drop policy if exists profiles_self_claim_request on profiles;
create policy profiles_self_claim_request on profiles for update using (
  deleted_at is null
  and current_user_role() = 'employee'
  and user_id is null
  and email = auth.email()
) with check (
  deleted_at is null
  and user_id is null
  and pending_claim_user_id = auth.uid()
);

drop policy if exists profiles_self_propose_change on profiles;
create policy profiles_self_propose_change on profiles for update using (
  deleted_at is null
  and current_user_role() = 'employee'
  and user_id = auth.uid()
  and status = 'published'
) with check (
  deleted_at is null
  and user_id = auth.uid()
  and status = 'published'
);

-- Application deletes are updates from this point onward. Removing the client-facing DELETE
-- policy prevents an accidental hard delete through the regular authenticated Supabase client.
drop policy if exists profiles_admin_delete on profiles;
