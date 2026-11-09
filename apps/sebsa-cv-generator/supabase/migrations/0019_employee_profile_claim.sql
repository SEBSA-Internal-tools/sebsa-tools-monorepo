-- Lets an employee discover and self-claim an *unclaimed* profile (user_id is null) that an
-- Admin bulk-added before that person ever logged in — matched strictly on the caller's own
-- verified login email (auth.email(), read from their own JWT), never client-supplied input.
-- This can only ever surface/claim profiles with no linked account yet; it can never expose or
-- touch someone else's already-claimed profile.
--
-- Complements 0018 (self-service create-from-scratch, used when no matching profile exists).
-- See app/onboarding/actions.ts (findClaimableProfileAction, claimProfileAction) and
-- docs/04-rbac-security.md.

create policy profiles_self_claimable_select on profiles for select using (
  current_user_role() = 'employee' and user_id is null and email = auth.email()
);

create policy profiles_self_claim on profiles for update using (
  current_user_role() = 'employee' and user_id is null and email = auth.email()
) with check (
  user_id = auth.uid()
);
