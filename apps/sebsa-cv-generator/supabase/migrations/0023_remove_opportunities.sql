-- Removes the `opportunities` table (customer/opportunity requirement extraction — 0008). Never
-- wired up to any real feature: no app code ever inserts into or selects from it, and the AI
-- provider abstraction that referenced an "opportunityId" (lib/ai/types.ts) was never invoked by
-- any route. `generated_cvs.opportunity_id` (0010) is dropped along with it via cascade, the same
-- way `generated_cvs.template_id` lost its FK when `templates` was removed (0021) — the column
-- itself is left in place (always null) rather than altering generated_cvs' shape further.
drop table if exists opportunities cascade;
