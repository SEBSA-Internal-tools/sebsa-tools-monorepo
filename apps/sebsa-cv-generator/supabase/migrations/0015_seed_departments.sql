-- Matches the department options hardcoded in the existing Upload/Repository UI dropdowns.
insert into departments (name) values
  ('Technical'),
  ('Functional'),
  ('Service Delivery'),
  ('Build and Deployment'),
  ('Finance')
on conflict (name) do nothing;
