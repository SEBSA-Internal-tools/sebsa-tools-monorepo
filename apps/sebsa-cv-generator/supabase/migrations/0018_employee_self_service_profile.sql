-- Closes the self-service loophole identified after 0017: no path previously linked a profile
-- to the auth user who owns it, so the 'employee' role had nothing to see once logged in. This
-- adds the minimal self-registration path described in the source access-control doc §3
-- ("Provisioning — Employee Self-Service"): an employee may create exactly one profile for
-- themselves, which starts as 'draft' (not searchable/usable — mirrors the doc's "Pending
-- Profile" concept using the existing draft/published status column rather than a new one) until
-- an Admin/Super Admin reviews and publishes it via the existing admin update path.
--
-- Deliberately NOT built here: a dedicated approve/reject action or "Pending Profiles" list UI —
-- an Admin can already flip status via existing tooling; a real review queue is future work.

-- 1. profiles: self-insert exactly one row for yourself, always starting as 'draft' -----------
create policy profiles_self_insert on profiles for insert with check (
  current_user_role() = 'employee' and user_id = auth.uid() and status = 'draft'
);

-- Employees may keep editing their own submission while it's still in draft (pre-review). Once
-- an Admin publishes it, further self-edits are blocked — that's the "Pending Change" flow from
-- the source doc, not implemented yet.
create policy profiles_self_update_draft on profiles for update using (
  current_user_role() = 'employee' and user_id = auth.uid() and status = 'draft'
) with check (
  current_user_role() = 'employee' and user_id = auth.uid() and status = 'draft'
);

-- 2. experiences / projects / certifications / profile_skills: writable while the owning ------
--    profile is still a draft owned by the caller.
create policy experiences_self_write on experiences for all using (
  exists (
    select 1 from profiles p
    where p.id = experiences.profile_id and p.user_id = auth.uid() and p.status = 'draft'
  )
) with check (
  exists (
    select 1 from profiles p
    where p.id = experiences.profile_id and p.user_id = auth.uid() and p.status = 'draft'
  )
);

create policy projects_self_write on projects for all using (
  exists (
    select 1 from profiles p
    where p.id = projects.profile_id and p.user_id = auth.uid() and p.status = 'draft'
  )
) with check (
  exists (
    select 1 from profiles p
    where p.id = projects.profile_id and p.user_id = auth.uid() and p.status = 'draft'
  )
);

create policy certifications_self_write on certifications for all using (
  exists (
    select 1 from profiles p
    where p.id = certifications.profile_id and p.user_id = auth.uid() and p.status = 'draft'
  )
) with check (
  exists (
    select 1 from profiles p
    where p.id = certifications.profile_id and p.user_id = auth.uid() and p.status = 'draft'
  )
);

create policy profile_skills_self_write on profile_skills for all using (
  exists (
    select 1 from profiles p
    where p.id = profile_skills.profile_id and p.user_id = auth.uid() and p.status = 'draft'
  )
) with check (
  exists (
    select 1 from profiles p
    where p.id = profile_skills.profile_id and p.user_id = auth.uid() and p.status = 'draft'
  )
);

-- 3. skills: the master skill list is a shared lookup table — any authenticated user may add a
--    new skill name (idempotent, low-risk), needed so self-service CV parsing can introduce
--    skills not already in the list. Existing skills_admin_write still covers update/delete.
create policy skills_authenticated_insert on skills for insert with check (auth.uid() is not null);
