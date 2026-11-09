-- Two roles for the MVP: 'admin' (full access) and 'employee' (self-service, own profile only).
-- See docs/04-rbac-security.md. `current_user_role()` is defined in 0002_user_roles.sql.
-- RLS is enabled AND forced everywhere so even the table owner is subject to policies on normal
-- request paths — only the service-role key (server-side only, see lib/supabase/admin.ts)
-- bypasses RLS entirely.

-- user_roles ------------------------------------------------------------
alter table user_roles enable row level security;
alter table user_roles force row level security;

create policy user_roles_self_or_admin_select on user_roles for select using (
  user_id = auth.uid() or current_user_role() = 'admin'
);
create policy user_roles_admin_write on user_roles for all using (
  current_user_role() = 'admin'
) with check (
  current_user_role() = 'admin'
);

-- departments -------------------------------------------------------------
alter table departments enable row level security;
alter table departments force row level security;

create policy departments_select on departments for select using (auth.uid() is not null);
create policy departments_admin_write on departments for all using (
  current_user_role() = 'admin'
) with check (
  current_user_role() = 'admin'
);

-- profiles ------------------------------------------------------------------
alter table profiles enable row level security;
alter table profiles force row level security;

create policy profiles_select on profiles for select using (
  current_user_role() = 'admin' or user_id = auth.uid()
);
create policy profiles_admin_insert on profiles for insert with check (
  current_user_role() = 'admin'
);
create policy profiles_admin_update on profiles for update using (
  current_user_role() = 'admin'
) with check (
  current_user_role() = 'admin'
);
create policy profiles_admin_delete on profiles for delete using (
  current_user_role() = 'admin'
);

-- experiences / projects / certifications ------------------------------------
-- select mirrors the parent profile's visibility; writes are admin-only.
create policy experiences_select on experiences for select using (
  exists (
    select 1 from profiles p where p.id = experiences.profile_id
      and (current_user_role() = 'admin' or p.user_id = auth.uid())
  )
);
create policy experiences_admin_write on experiences for all using (
  current_user_role() = 'admin'
) with check (
  current_user_role() = 'admin'
);
alter table experiences enable row level security;
alter table experiences force row level security;

create policy projects_select on projects for select using (
  exists (
    select 1 from profiles p where p.id = projects.profile_id
      and (current_user_role() = 'admin' or p.user_id = auth.uid())
  )
);
create policy projects_admin_write on projects for all using (
  current_user_role() = 'admin'
) with check (
  current_user_role() = 'admin'
);
alter table projects enable row level security;
alter table projects force row level security;

create policy certifications_select on certifications for select using (
  exists (
    select 1 from profiles p where p.id = certifications.profile_id
      and (current_user_role() = 'admin' or p.user_id = auth.uid())
  )
);
create policy certifications_admin_write on certifications for all using (
  current_user_role() = 'admin'
) with check (
  current_user_role() = 'admin'
);
alter table certifications enable row level security;
alter table certifications force row level security;

-- skills / profile_skills ------------------------------------------------------
alter table skills enable row level security;
alter table skills force row level security;

create policy skills_select on skills for select using (auth.uid() is not null);
create policy skills_admin_write on skills for all using (
  current_user_role() = 'admin'
) with check (
  current_user_role() = 'admin'
);

alter table profile_skills enable row level security;
alter table profile_skills force row level security;

create policy profile_skills_select on profile_skills for select using (
  exists (
    select 1 from profiles p where p.id = profile_skills.profile_id
      and (current_user_role() = 'admin' or p.user_id = auth.uid())
  )
);
create policy profile_skills_admin_write on profile_skills for all using (
  current_user_role() = 'admin'
) with check (
  current_user_role() = 'admin'
);

-- opportunities ---------------------------------------------------------------
alter table opportunities enable row level security;
alter table opportunities force row level security;

create policy opportunities_admin_all on opportunities for all using (
  current_user_role() = 'admin'
) with check (
  current_user_role() = 'admin'
);

-- templates ---------------------------------------------------------------------
alter table templates enable row level security;
alter table templates force row level security;

create policy templates_admin_all on templates for all using (
  current_user_role() = 'admin'
) with check (
  current_user_role() = 'admin'
);

-- generated_cvs -------------------------------------------------------------------
alter table generated_cvs enable row level security;
alter table generated_cvs force row level security;

create policy generated_cvs_admin_all on generated_cvs for all using (
  current_user_role() = 'admin'
) with check (
  current_user_role() = 'admin'
);

-- files -----------------------------------------------------------------------------
alter table files enable row level security;
alter table files force row level security;

create policy files_select on files for select using (
  current_user_role() = 'admin'
  or (
    related_entity_type = 'profile'
    and exists (
      select 1 from profiles p where p.id = files.related_entity_id and p.user_id = auth.uid()
    )
  )
);
create policy files_admin_write on files for all using (
  current_user_role() = 'admin'
) with check (
  current_user_role() = 'admin'
);

-- audit_logs -------------------------------------------------------------------------
-- No insert policy for the authenticated/anon roles: writes only ever happen via the
-- service-role client (lib/supabase/admin.ts) in Route Handlers, which bypasses RLS entirely.
alter table audit_logs enable row level security;
alter table audit_logs force row level security;

create policy audit_logs_admin_select on audit_logs for select using (
  current_user_role() = 'admin'
);

-- app_settings ------------------------------------------------------------------------
alter table app_settings enable row level security;
alter table app_settings force row level security;

create policy app_settings_select on app_settings for select using (auth.uid() is not null);
create policy app_settings_admin_write on app_settings for all using (
  current_user_role() = 'admin'
) with check (
  current_user_role() = 'admin'
);

-- notification_preferences -------------------------------------------------------------
alter table notification_preferences enable row level security;
alter table notification_preferences force row level security;

create policy notification_preferences_self_or_admin on notification_preferences for all using (
  user_id = auth.uid() or current_user_role() = 'admin'
) with check (
  user_id = auth.uid() or current_user_role() = 'admin'
);
