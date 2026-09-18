-- CreateEnum
CREATE TYPE "ConfigScope" AS ENUM ('GLOBAL', 'CSO');

-- CreateEnum
CREATE TYPE "ConfigKind" AS ENUM ('PROJECT_TYPE', 'PROJECT_STATUS', 'CASE_TYPE', 'CASE_STATUS', 'TASK_STATUS', 'SUBTASK_STATUS', 'TASK_TYPE', 'SUBTASK_TYPE', 'COMPLEXITY_LEVEL', 'PRIORITY');

-- CreateTable
CREATE TABLE "config_options" (
    "id" TEXT NOT NULL,
    "kind" "ConfigKind" NOT NULL,
    "scope" "ConfigScope" NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT,
    "order" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "isCancelled" BOOLEAN NOT NULL DEFAULT false,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "config_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "config_options_kind_scope_isActive_idx" ON "config_options"("kind", "scope", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "config_options_kind_scope_key_key" ON "config_options"("kind", "scope", "key");

-- ---------------------------------------------------------------------------
-- Seed every list from the values already in use, for both scopes.
--
-- `key` carries the current enum value so existing application logic keeps
-- matching; `label` is the display text admins are free to change. Seeded rows
-- are marked isSystem so the API refuses to delete them.
-- ---------------------------------------------------------------------------

INSERT INTO "config_options"
  ("id","kind","scope","key","label","color","order","isDefault","isCompleted","isCancelled","isSystem","updatedAt")
SELECT
  gen_random_uuid(), seed.kind::"ConfigKind", scope.scope::"ConfigScope",
  seed.key, seed.label, seed.color, seed.ord,
  seed.is_default, seed.is_completed, seed.is_cancelled, true, NOW()
FROM (VALUES
  -- Project types
  ('PROJECT_TYPE','IFS_IMPLEMENTATION','IFS Implementation',NULL,1,false,false,false),
  ('PROJECT_TYPE','IFS_SUPPORT','IFS Support',NULL,2,false,false,false),
  ('PROJECT_TYPE','INTERNAL','Internal',NULL,3,false,false,false),
  ('PROJECT_TYPE','CUSTOMIZATION','Customization',NULL,4,false,false,false),
  ('PROJECT_TYPE','UPGRADE','Upgrade',NULL,5,false,false,false),
  ('PROJECT_TYPE','CONFIGURATION','Configuration',NULL,6,false,false,false),
  ('PROJECT_TYPE','CUSTOM','Custom',NULL,7,false,false,false),
  -- Project statuses
  ('PROJECT_STATUS','PLANNING','Planning','#64748B',1,true,false,false),
  ('PROJECT_STATUS','ACTIVE','Active','#3B82F6',2,false,false,false),
  ('PROJECT_STATUS','ON_HOLD','On Hold','#F59E0B',3,false,false,false),
  ('PROJECT_STATUS','COMPLETED','Completed','#10B981',4,false,true,false),
  ('PROJECT_STATUS','ARCHIVED','Archived','#94A3B8',5,false,true,false),
  -- Case types
  ('CASE_TYPE','EPIC','Epic','#7C3AED',1,false,false,false),
  ('CASE_TYPE','STORY','Story','#3B82F6',2,false,false,false),
  ('CASE_TYPE','BUG','Bug','#EF4444',3,false,false,false),
  ('CASE_TYPE','IMPROVEMENT','Improvement','#F59E0B',4,false,false,false),
  ('CASE_TYPE','TEST','Test','#10B981',5,false,false,false),
  ('CASE_TYPE','GENERAL','General','#64748B',6,true,false,false),
  -- Case statuses
  ('CASE_STATUS','TO_DO','To Do','#64748B',1,true,false,false),
  ('CASE_STATUS','IN_PROGRESS','In Progress','#3B82F6',2,false,false,false),
  ('CASE_STATUS','IN_REVIEW','In Review','#7C3AED',3,false,false,false),
  ('CASE_STATUS','BLOCKED','Blocked','#EF4444',4,false,false,false),
  ('CASE_STATUS','DONE','Done','#10B981',5,false,true,false),
  ('CASE_STATUS','CANCELLED','Cancelled','#94A3B8',6,false,false,true),
  -- Task statuses
  ('TASK_STATUS','TO_DO','To Do','#64748B',1,true,false,false),
  ('TASK_STATUS','IN_PROGRESS','In Progress','#3B82F6',2,false,false,false),
  ('TASK_STATUS','IN_REVIEW','In Review','#7C3AED',3,false,false,false),
  ('TASK_STATUS','BLOCKED','Blocked','#EF4444',4,false,false,false),
  ('TASK_STATUS','DONE','Done','#10B981',5,false,true,false),
  ('TASK_STATUS','CANCELLED','Cancelled','#94A3B8',6,false,false,true),
  -- Subtask statuses
  ('SUBTASK_STATUS','TO_DO','To Do','#64748B',1,true,false,false),
  ('SUBTASK_STATUS','IN_PROGRESS','In Progress','#3B82F6',2,false,false,false),
  ('SUBTASK_STATUS','DONE','Done','#10B981',3,false,true,false)
) AS seed(kind,key,label,color,ord,is_default,is_completed,is_cancelled)
CROSS JOIN (VALUES ('GLOBAL'),('CSO')) AS scope(scope);

-- Priorities were per-project. Collapse them into one list per scope, taking
-- each distinct name from the projects that scope covers so no name in use is
-- lost. DISTINCT ON keeps one representative row's colour and ordering.
INSERT INTO "config_options"
  ("id","kind","scope","key","label","color","order","isDefault","isSystem","updatedAt")
SELECT
  gen_random_uuid(), 'PRIORITY'::"ConfigKind", src.scope::"ConfigScope",
  src.name, src.name, src.color,
  ROW_NUMBER() OVER (PARTITION BY src.scope ORDER BY src."order", src.name),
  bool_or(src."isDefault") OVER (PARTITION BY src.scope, src.name),
  true, NOW()
FROM (
  SELECT DISTINCT ON (scope, pp.name)
    CASE WHEN p."isCsoProject" THEN 'CSO' ELSE 'GLOBAL' END AS scope,
    pp.name, pp.color, pp."order", pp."isDefault"
  FROM "project_priorities" pp
  JOIN "projects" p ON p.id = pp."projectId"
  WHERE p."deletedAt" IS NULL
  ORDER BY scope, pp.name, pp."order"
) AS src;

-- A scope with no projects yet still needs a usable list.
INSERT INTO "config_options"
  ("id","kind","scope","key","label","color","order","isDefault","isSystem","updatedAt")
SELECT gen_random_uuid(), 'PRIORITY'::"ConfigKind", s.scope::"ConfigScope",
       d.key, d.label, d.color, d.ord, d.is_default, true, NOW()
FROM (VALUES ('GLOBAL'),('CSO')) AS s(scope)
CROSS JOIN (VALUES
  ('LOW','Low','#10B981',1,false),
  ('MEDIUM','Medium','#F59E0B',2,true),
  ('HIGH','High','#EF4444',3,false),
  ('CRITICAL','Critical','#B91C1C',4,false)
) AS d(key,label,color,ord,is_default)
WHERE NOT EXISTS (
  SELECT 1 FROM "config_options" c
  WHERE c.kind = 'PRIORITY' AND c.scope = s.scope::"ConfigScope"
);
