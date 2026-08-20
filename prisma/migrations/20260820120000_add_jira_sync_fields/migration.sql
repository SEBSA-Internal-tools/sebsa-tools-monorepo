-- AlterEnum
ALTER TYPE "IntegrationType" ADD VALUE 'JIRA';

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN "jiraIssueKey" TEXT,
ADD COLUMN "jiraSyncedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "tasks_jiraIssueKey_key" ON "tasks"("jiraIssueKey");
