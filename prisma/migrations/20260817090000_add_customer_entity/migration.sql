-- Hand-authored migration (not `prisma migrate dev`-generated): adding a
-- required column to a non-empty table plus a data backfill are both things
-- Prisma's diff engine cannot do on its own — see docs/database-architecture.md
-- "Constraints added by hand" for the established pattern (e.g. the
-- `User.approvedAt` backfill). Reinstates the `Customer` entity that was
-- previously modeled and then reverted in
-- prisma/migrations/20260812065952_add_cso_groundwork and
-- prisma/migrations/20260812104437_remove_customer_entity_use_project_field —
-- see docs/database-architecture.md design decision #12 for why.

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_name_key" ON "customers"("name");

-- Data backfill, part 1: seed one fallback Customer for every existing
-- project that has no customerName set (customerName was only ever
-- populated for CSO projects, so this covers the majority of rows).
INSERT INTO "customers" ("id", "name", "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, 'Unassigned', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Data backfill, part 2: seed one Customer per distinct existing
-- Project.customerName value (exact, trimmed match — casing variants such
-- as "Acme Corp" vs "ACME Corp." are intentionally NOT merged here; the
-- team can consolidate duplicates by hand via the new Customers page if any
-- exist, the same trade-off already accepted in design decision #12).
INSERT INTO "customers" ("id", "name", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, distinct_names.name, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT TRIM("customerName") AS name
    FROM "projects"
    WHERE "customerName" IS NOT NULL AND TRIM("customerName") <> ''
) AS distinct_names
WHERE distinct_names.name <> 'Unassigned';

-- AlterTable: add the new column nullable first so it can be backfilled row
-- by row before the NOT NULL constraint is applied.
ALTER TABLE "projects" ADD COLUMN "customerId" TEXT;

-- Data backfill, part 3: point every project at its matching Customer by
-- (trimmed) name, falling back to "Unassigned" for the projects that never
-- had a customerName.
UPDATE "projects" p
SET "customerId" = c."id"
FROM "customers" c
WHERE p."customerName" IS NOT NULL
  AND TRIM(p."customerName") <> ''
  AND c."name" = TRIM(p."customerName");

UPDATE "projects" p
SET "customerId" = (SELECT "id" FROM "customers" WHERE "name" = 'Unassigned')
WHERE p."customerId" IS NULL;

-- AlterTable: every project now has a customerId — enforce it going forward.
ALTER TABLE "projects" ALTER COLUMN "customerId" SET NOT NULL;

-- AlterTable: drop the now-superseded free-text column.
ALTER TABLE "projects" DROP COLUMN "customerName";

-- CreateIndex
CREATE INDEX "projects_customerId_idx" ON "projects"("customerId");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
