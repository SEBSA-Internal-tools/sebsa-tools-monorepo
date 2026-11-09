insert into storage.buckets (id, name, public)
values ('original-cvs', 'original-cvs', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('generated-cvs', 'generated-cvs', false)
on conflict (id) do nothing;

-- Both buckets stay private; access is only ever brokered through signed URLs generated
-- server-side after an RLS/role check (see docs/03-database-schema.md §3).
create policy original_cvs_admin_rw on storage.objects for all using (
  bucket_id = 'original-cvs' and current_user_role() = 'admin'
) with check (
  bucket_id = 'original-cvs' and current_user_role() = 'admin'
);

create policy generated_cvs_admin_rw on storage.objects for all using (
  bucket_id = 'generated-cvs' and current_user_role() = 'admin'
) with check (
  bucket_id = 'generated-cvs' and current_user_role() = 'admin'
);
