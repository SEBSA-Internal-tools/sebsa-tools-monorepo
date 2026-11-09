-- Removes profiles.employee_code entirely. The app previously used it as a human-readable
-- routing/lookup identifier (e.g. /repository/EMP-00124) alongside the real primary key `id`.
-- Now that RLS/every mutation already keys off `id` (uuid) and `user_id`, employee_code was pure
-- redundancy — a second identifier to keep unique (generateEmployeeCode() + retry-on-collision
-- logic in repositories/employee-repository.ts) with no purpose `id` didn't already serve.
-- Every app-layer reference (routes, redirects, queries) was moved to `id` in the same change.
alter table profiles drop column if exists employee_code;
