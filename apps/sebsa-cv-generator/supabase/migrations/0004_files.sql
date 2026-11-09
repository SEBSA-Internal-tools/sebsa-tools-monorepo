-- Created before profiles/opportunities/generated_cvs since they FK into it.
create table if not exists files (
  id uuid primary key default gen_random_uuid(),
  bucket text not null check (bucket in ('original-cvs', 'generated-cvs')),
  storage_path text not null,
  original_filename text not null,
  mime_type text,
  size_bytes bigint,
  related_entity_type text check (related_entity_type in ('profile', 'opportunity', 'generated_cv')),
  related_entity_id uuid,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists files_related_entity_idx on files (related_entity_type, related_entity_id);
