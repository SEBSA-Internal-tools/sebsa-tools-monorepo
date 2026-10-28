-- Create profile-pictures bucket for employee avatar images (idempotent)
insert into storage.buckets (id, name, public)
values ('profile-pictures', 'profile-pictures', true)
on conflict (id) do nothing;

-- NOTE: the original file also created profile_pictures_auth_upload and profile_pictures_auth_read
-- with `create policy if not exists`, which is not valid Postgres, so those statements could never
-- have run. Production does NOT have either policy (checked against a schema dump), and uploads go
-- through the server (service role). They are omitted here so a database rebuilt from migrations
-- matches production rather than being more permissive.

-- Allow admin users to delete/update profile pictures
drop policy if exists profile_pictures_admin_rw on storage.objects;
create policy profile_pictures_admin_rw on storage.objects
  for all
  using (
    bucket_id = 'profile-pictures'
    and current_user_role() = 'admin'
  )
  with check (
    bucket_id = 'profile-pictures'
    and current_user_role() = 'admin'
  );
