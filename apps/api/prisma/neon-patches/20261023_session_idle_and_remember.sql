-- Add last_active_at and remember columns to refresh_sessions
-- Additive and idempotent without NOT NULL constraints.
BEGIN;

ALTER TABLE "refresh_sessions" ADD COLUMN IF NOT EXISTS "last_active_at" TIMESTAMPTZ(6);
ALTER TABLE "refresh_sessions" ADD COLUMN IF NOT EXISTS "remember" BOOLEAN;

COMMIT;
