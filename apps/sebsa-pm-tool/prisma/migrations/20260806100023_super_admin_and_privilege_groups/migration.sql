-- Hand-authored migration (not Prisma-generated): `prisma migrate dev` refuses
-- this diff non-interactively because it involves an enum value rename and
-- dropping non-null columns with existing data. Both parts are safe here
-- because the data shape was verified beforehand (see docs/database-architecture.md).

-- =============================================================================
-- Part 1: SystemRole — rename SYSTEM_ADMIN to ADMIN, add SUPER_ADMIN above it.
-- A true RENAME VALUE (not drop+add) so existing rows keep working.
-- =============================================================================
ALTER TYPE "SystemRole" RENAME VALUE 'SYSTEM_ADMIN' TO 'ADMIN';
ALTER TYPE "SystemRole" ADD VALUE 'SUPER_ADMIN';

-- =============================================================================
-- Part 2: Extract Role's six permission booleans into a reusable, system-wide
-- PrivilegeGroup that Role references by FK instead of owning flags directly.
-- =============================================================================

-- AlterTable
CREATE TABLE "privilege_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "canCreateTask" BOOLEAN NOT NULL DEFAULT false,
    "canDeleteTask" BOOLEAN NOT NULL DEFAULT false,
    "canManageMembers" BOOLEAN NOT NULL DEFAULT false,
    "canConfigureIntegrations" BOOLEAN NOT NULL DEFAULT false,
    "canManageWorkflow" BOOLEAN NOT NULL DEFAULT false,
    "isReadOnly" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "privilege_groups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "privilege_groups_name_key" ON "privilege_groups"("name");

-- Seed the four groups matching the current DEFAULT_PROJECT_ROLES flag-sets
-- (apps/ipm-be/src/app/projects/constants.ts) exactly, so existing roles.
-- Verified against the live data beforehand: exactly these four distinct
-- flag-tuples exist across all current `roles` rows, one per default role.
INSERT INTO "privilege_groups" (
  "id", "name", "description",
  "canCreateTask", "canDeleteTask", "canManageMembers", "canConfigureIntegrations", "canManageWorkflow", "isReadOnly",
  "createdAt", "updatedAt"
) VALUES
  (gen_random_uuid()::text, 'Owner Access', 'Full control: create/delete tasks, manage members, configure integrations, manage workflow.', true, true, true, true, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Manager Access', 'Create/delete tasks, manage members, manage workflow — no integrations config.', true, true, true, false, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Member Access', 'Standard contributor — no elevated permissions.', false, false, false, false, false, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Read-Only Access', 'View-only, cannot make changes.', false, false, false, false, false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- AlterTable: add the FK column, backfill by matching each role's existing
-- flag-tuple to the equivalent seeded group, then drop the old columns.
ALTER TABLE "roles" ADD COLUMN "privilegeGroupId" TEXT;

UPDATE "roles" SET "privilegeGroupId" = (
  SELECT pg."id" FROM "privilege_groups" pg
  WHERE pg."canCreateTask" = roles."canCreateTask"
    AND pg."canDeleteTask" = roles."canDeleteTask"
    AND pg."canManageMembers" = roles."canManageMembers"
    AND pg."canConfigureIntegrations" = roles."canConfigureIntegrations"
    AND pg."canManageWorkflow" = roles."canManageWorkflow"
    AND pg."isReadOnly" = roles."isReadOnly"
  LIMIT 1
);

-- Safety net: fail loudly rather than silently leaving a row unmapped if a
-- role's flag-tuple didn't match one of the four seeded groups.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "roles" WHERE "privilegeGroupId" IS NULL) THEN
    RAISE EXCEPTION 'One or more roles rows did not match a seeded PrivilegeGroup — backfill incomplete.';
  END IF;
END $$;

ALTER TABLE "roles" ALTER COLUMN "privilegeGroupId" SET NOT NULL;
ALTER TABLE "roles" ADD CONSTRAINT "roles_privilegeGroupId_fkey" FOREIGN KEY ("privilegeGroupId") REFERENCES "privilege_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "roles_privilegeGroupId_idx" ON "roles"("privilegeGroupId");

ALTER TABLE "roles"
  DROP COLUMN "canCreateTask",
  DROP COLUMN "canDeleteTask",
  DROP COLUMN "canManageMembers",
  DROP COLUMN "canConfigureIntegrations",
  DROP COLUMN "canManageWorkflow",
  DROP COLUMN "isReadOnly";
