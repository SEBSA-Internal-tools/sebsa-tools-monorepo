CREATE TABLE "project_priorities" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "order" INTEGER NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "project_priorities_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "project_priorities" ADD CONSTRAINT "project_priorities_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "project_priorities" ("id", "projectId", "name", "color", "order", "isDefault", "createdAt", "updatedAt")
SELECT gen_random_uuid(), "id", 'MEDIUM', '#F59E0B', 2, true, NOW(), NOW() FROM "projects";

ALTER TABLE "tasks" ADD COLUMN "priorityId" TEXT;

UPDATE "tasks"
SET "priorityId" = (
    SELECT "id" 
    FROM "project_priorities" 
    WHERE "project_priorities"."projectId" = "tasks"."projectId" 
    LIMIT 1
);

ALTER TABLE "tasks" ALTER COLUMN "priorityId" SET NOT NULL;

ALTER TABLE "tasks" DROP COLUMN "priority";

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_priorityId_fkey" FOREIGN KEY ("priorityId") REFERENCES "project_priorities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP TYPE "Priority";
