-- Preserve the user-defined certification order, matching experiences and projects.
alter table certifications
  add column if not exists display_order integer not null default 0;

with ordered_certifications as (
  select
    id,
    row_number() over (partition by profile_id order by created_at, id) - 1 as position
  from certifications
)
update certifications
set display_order = ordered_certifications.position
from ordered_certifications
where certifications.id = ordered_certifications.id;

create index if not exists certifications_profile_display_order_idx
  on certifications (profile_id, display_order);
