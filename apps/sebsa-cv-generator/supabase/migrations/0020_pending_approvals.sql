-- Builds the minimal maker-checker layer the source access-control doc describes (§2/§3),
-- previously deferred: Super Admin / CV Reviewer must approve (a) an employee claiming an
-- existing unclaimed profile, and (b) an employee's proposed edit to their own published
-- profile. New-from-scratch self-service profiles (0018) already have an implicit review gate
-- via status='draft' — this migration just adds the explicit approve/reject actions for it too.
--
-- Approve/reject actions themselves are implemented in Server Actions using the service-role
-- admin client with a role check as the enforcement boundary (app/(authenticated)/review/actions.ts)
-- — the same established pattern as createEmployeeAction/updateEmployeeAction/listUsersAction —
-- rather than RLS, since the approval merge logic (applying pending_change to live columns +
-- child tables) isn't expressible as a simple row-level policy.

alter table profiles add column pending_claim_user_id uuid references auth.users(id) on delete set null;
alter table profiles add column pending_change jsonb;
alter table profiles add column pending_change_submitted_at timestamptz;

-- 1. Claiming now requests review instead of linking immediately -------------------------
-- Replaces 0019's profiles_self_claim (which set user_id directly) — same matching logic
-- (unclaimed, caller's own verified email) but now stages the request for a reviewer instead.
drop policy if exists profiles_self_claim on profiles;
create policy profiles_self_claim_request on profiles for update using (
  current_user_role() = 'employee' and user_id is null and email = auth.email()
) with check (
  user_id is null and pending_claim_user_id = auth.uid()
);

-- 2. Employees may propose changes to their own already-published profile -----------------
-- Direct self-edit (profiles_self_update_draft, 0018) still covers status='draft' (their
-- own not-yet-first-published submission) — this covers status='published', where edits must
-- go through review instead of applying immediately.
create policy profiles_self_propose_change on profiles for update using (
  current_user_role() = 'employee' and user_id = auth.uid() and status = 'published'
) with check (
  user_id = auth.uid() and status = 'published'
);

-- 3. CV Reviewer may now also create employee profiles (widened from admin-only) ----------
drop policy if exists profiles_admin_insert on profiles;
create policy profiles_reviewer_insert on profiles for insert with check (is_reviewer_or_above());
