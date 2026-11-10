-- Jira sync becomes one-way (Jira -> here) and links to a Case rather than a
-- Task, so an issue's status and description sit alongside the case they
-- describe. Linking is explicit: nothing is created from Jira automatically.
--
-- The Task-level link is dropped. The only rows holding one were test data, and
-- nothing pushes to Jira any more, so there is nothing to carry across.

-- Task keeps its manual jiraStatusLabel; the sync columns go.
DROP INDEX IF EXISTS "tasks_jiraIssueKey_key";
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "jiraIssueKey";
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "jiraSyncedAt";

-- Case gains the link plus the two synced fields.
ALTER TABLE "cases" ADD COLUMN "jiraIssueKey" TEXT;
ALTER TABLE "cases" ADD COLUMN "jiraSyncedAt" TIMESTAMP(3);
ALTER TABLE "cases" ADD COLUMN "jiraDescription" TEXT;

CREATE UNIQUE INDEX "cases_jiraIssueKey_key" ON "cases"("jiraIssueKey");
