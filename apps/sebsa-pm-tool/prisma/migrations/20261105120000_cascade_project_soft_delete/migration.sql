-- Deleting a project now soft-deletes its cases, tasks and subtasks too (see
-- ProjectsService.remove). Backfill projects that were deleted before that, so
-- their work items stop appearing in Assigned Work, search and dashboards.

UPDATE "subtasks" s
SET "deletedAt" = p."deletedAt"
FROM "tasks" t
JOIN "cases" c ON c."id" = t."caseId"
JOIN "projects" p ON p."id" = c."projectId"
WHERE s."taskId" = t."id"
  AND p."deletedAt" IS NOT NULL
  AND s."deletedAt" IS NULL;

UPDATE "tasks" t
SET "deletedAt" = p."deletedAt"
FROM "cases" c
JOIN "projects" p ON p."id" = c."projectId"
WHERE t."caseId" = c."id"
  AND p."deletedAt" IS NOT NULL
  AND t."deletedAt" IS NULL;

UPDATE "cases" c
SET "deletedAt" = p."deletedAt"
FROM "projects" p
WHERE c."projectId" = p."id"
  AND p."deletedAt" IS NOT NULL
  AND c."deletedAt" IS NULL;
