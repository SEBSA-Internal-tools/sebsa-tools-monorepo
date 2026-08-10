-- AlterTable
ALTER TABLE "users" ADD COLUMN     "approvedAt" TIMESTAMP(3);

-- Hand-authored backfill: existing accounts predate the approval concept and
-- must not be retroactively locked out by it. Treat "already existed before
-- this migration" as "already approved" (approvedAt = createdAt).
UPDATE "users" SET "approvedAt" = "createdAt" WHERE "approvedAt" IS NULL;
