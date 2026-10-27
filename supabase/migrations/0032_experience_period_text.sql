-- Preserve the employment period exactly as extracted from the CV. PostgreSQL's `date` type
-- cannot represent partial dates such as "Jun 2020", so start_date/end_date are populated only
-- when the source includes a complete date and this column remains the lossless source value.
alter table public.experiences
  add column if not exists period_text text;
