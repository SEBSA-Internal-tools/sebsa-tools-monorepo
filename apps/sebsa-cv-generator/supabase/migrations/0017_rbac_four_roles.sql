-- Extends the two-role MVP model (admin/employee) to the four roles defined in
-- SEBSA_Access_Control_Retention_Privacy_Protocol.docx v1.1: super_admin, admin, cv_reviewer,
-- employee. See docs/04-rbac-security.md for the full rationale, including two flagged
-- inconsistencies in the source document that this migration deliberately does NOT encode
-- literally (they'd either break existing Admin functionality or contradict the doc's own
-- Section 3 "Role Changes" text).
--
-- Explicitly OUT of scope here (tracked as future phases, not implemented):
--   - Pending Profile / Pending Change maker-checker workflow (Section 2/3 "Approve" actions)
--   - Retention holds and automated disposal (Section 5)
--   - Expanded audit logging for access-control/lifecycle events (Section 7)

-- 1. Widen the role check constraint ----------------------------------------------------
alter table user_roles drop constraint if exists user_roles_role_check;
alter table user_roles add constraint user_roles_role_check
  check (role in ('super_admin', 'admin', 'cv_reviewer', 'employee'));

-- 2. Role-tier helper functions, layered on current_user_role() (0002_user_roles.sql) ----
create or replace function public.is_admin_or_above()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select current_user_role() in ('admin', 'super_admin')
$$;

create or replace function public.is_reviewer_or_above()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select current_user_role() in ('admin', 'super_admin', 'cv_reviewer')
$$;

-- 3. profiles / experiences / projects / certifications / profile_skills ----------------
-- Read access widens to include cv_reviewer (matrix: CV Reviewer "View" on profiles).
-- Write access (insert/update/delete) is UNCHANGED — still admin_or_above only. The matrix
-- describes Admin as read-only with edits going through CV Reviewer approval, but that
-- approval workflow doesn't exist yet; restricting Admin to read-only now would remove the
-- only working profile-CRUD path in the app. See docs/04-rbac-security.md §1a.
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select using (
  is_reviewer_or_above() or user_id = auth.uid()
);

drop policy if exists profiles_admin_insert on profiles;
create policy profiles_admin_insert on profiles for insert with check (is_admin_or_above());

drop policy if exists profiles_admin_update on profiles;
create policy profiles_admin_update on profiles for update using (is_admin_or_above())
  with check (is_admin_or_above());

drop policy if exists profiles_admin_delete on profiles;
create policy profiles_admin_delete on profiles for delete using (is_admin_or_above());

drop policy if exists experiences_select on experiences;
create policy experiences_select on experiences for select using (
  exists (
    select 1 from profiles p where p.id = experiences.profile_id
      and (is_reviewer_or_above() or p.user_id = auth.uid())
  )
);
drop policy if exists experiences_admin_write on experiences;
create policy experiences_admin_write on experiences for all using (is_admin_or_above())
  with check (is_admin_or_above());

drop policy if exists projects_select on projects;
create policy projects_select on projects for select using (
  exists (
    select 1 from profiles p where p.id = projects.profile_id
      and (is_reviewer_or_above() or p.user_id = auth.uid())
  )
);
drop policy if exists projects_admin_write on projects;
create policy projects_admin_write on projects for all using (is_admin_or_above())
  with check (is_admin_or_above());

drop policy if exists certifications_select on certifications;
create policy certifications_select on certifications for select using (
  exists (
    select 1 from profiles p where p.id = certifications.profile_id
      and (is_reviewer_or_above() or p.user_id = auth.uid())
  )
);
drop policy if exists certifications_admin_write on certifications;
create policy certifications_admin_write on certifications for all using (is_admin_or_above())
  with check (is_admin_or_above());

drop policy if exists profile_skills_select on profile_skills;
create policy profile_skills_select on profile_skills for select using (
  exists (
    select 1 from profiles p where p.id = profile_skills.profile_id
      and (is_reviewer_or_above() or p.user_id = auth.uid())
  )
);
drop policy if exists profile_skills_admin_write on profile_skills;
create policy profile_skills_admin_write on profile_skills for all using (is_admin_or_above())
  with check (is_admin_or_above());

-- 4. files (original CV) — read widens to cv_reviewer, matching matrix "View, Download" ---
drop policy if exists files_select on files;
create policy files_select on files for select using (
  is_reviewer_or_above()
  or (
    related_entity_type = 'profile'
    and exists (
      select 1 from profiles p where p.id = files.related_entity_id and p.user_id = auth.uid()
    )
  )
);
drop policy if exists files_admin_write on files;
create policy files_admin_write on files for all using (is_admin_or_above())
  with check (is_admin_or_above());

-- 5. templates — matrix explicitly gives CV Reviewer full Upload/Edit/Delete ---------------
drop policy if exists templates_admin_all on templates;
create policy templates_reviewer_all on templates for all using (is_reviewer_or_above())
  with check (is_reviewer_or_above());

-- 6. generated_cvs — matrix gives CV Reviewer "View" only, write stays admin_or_above -------
drop policy if exists generated_cvs_admin_all on generated_cvs;
create policy generated_cvs_select on generated_cvs for select using (is_reviewer_or_above());
create policy generated_cvs_admin_write on generated_cvs for insert with check (is_admin_or_above());
create policy generated_cvs_admin_update on generated_cvs for update using (is_admin_or_above())
  with check (is_admin_or_above());
create policy generated_cvs_admin_delete on generated_cvs for delete using (is_admin_or_above());

-- 7. opportunities — matrix shows no CV Reviewer access ("—"); unchanged, admin_or_above only
drop policy if exists opportunities_admin_all on opportunities;
create policy opportunities_admin_all on opportunities for all using (is_admin_or_above())
  with check (is_admin_or_above());

-- 8. audit_logs — matrix gives CV Reviewer full read too ("View (full)") -------------------
drop policy if exists audit_logs_admin_select on audit_logs;
create policy audit_logs_select on audit_logs for select using (is_reviewer_or_above());

-- 9. departments / skills / app_settings admin-write bumped to admin_or_above --------------
drop policy if exists departments_admin_write on departments;
create policy departments_admin_write on departments for all using (is_admin_or_above())
  with check (is_admin_or_above());

drop policy if exists skills_admin_write on skills;
create policy skills_admin_write on skills for all using (is_admin_or_above())
  with check (is_admin_or_above());

drop policy if exists app_settings_admin_write on app_settings;
create policy app_settings_admin_write on app_settings for all using (is_admin_or_above())
  with check (is_admin_or_above());

-- 10. user_roles — the actual "user access" grant hierarchy ------------------------------
-- Section 3 "Role Changes" (more specific than the matrix, which has an internal
-- inconsistency here — see docs/04-rbac-security.md §1b):
--   - Only super_admin may grant/revoke admin or super_admin.
--   - super_admin or admin may grant/revoke cv_reviewer.
--   - Nobody but super_admin may touch a row that is currently admin/super_admin.
drop policy if exists user_roles_self_or_admin_select on user_roles;
create policy user_roles_select on user_roles for select using (
  user_id = auth.uid() or is_reviewer_or_above()
);

drop policy if exists user_roles_admin_write on user_roles;
create policy user_roles_write on user_roles for all using (
  current_user_role() = 'super_admin'
  or (current_user_role() = 'admin' and role in ('cv_reviewer', 'employee'))
) with check (
  current_user_role() = 'super_admin'
  or (current_user_role() = 'admin' and role in ('cv_reviewer', 'employee'))
);

-- 11. storage buckets — read widens to reviewer_or_above, matching files_select above -----
drop policy if exists original_cvs_admin_rw on storage.objects;
create policy original_cvs_rw on storage.objects for all using (
  bucket_id = 'original-cvs' and is_admin_or_above()
) with check (
  bucket_id = 'original-cvs' and is_admin_or_above()
);
create policy original_cvs_reviewer_select on storage.objects for select using (
  bucket_id = 'original-cvs' and is_reviewer_or_above()
);

drop policy if exists generated_cvs_admin_rw on storage.objects;
create policy generated_cvs_rw on storage.objects for all using (
  bucket_id = 'generated-cvs' and is_admin_or_above()
) with check (
  bucket_id = 'generated-cvs' and is_admin_or_above()
);
create policy generated_cvs_reviewer_select on storage.objects for select using (
  bucket_id = 'generated-cvs' and is_reviewer_or_above()
);

-- 12. profile-pictures bucket (0016) — same admin -> admin_or_above widening ---------------
drop policy if exists profile_pictures_admin_rw on storage.objects;
create policy profile_pictures_admin_rw on storage.objects for all using (
  bucket_id = 'profile-pictures' and is_admin_or_above()
) with check (
  bucket_id = 'profile-pictures' and is_admin_or_above()
);
