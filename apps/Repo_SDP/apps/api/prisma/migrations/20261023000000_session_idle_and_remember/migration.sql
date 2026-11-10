-- Add last_active_at and remember columns to refresh_sessions
ALTER TABLE "public"."refresh_sessions"
ADD COLUMN IF NOT EXISTS "last_active_at" TIMESTAMPTZ(6),
ADD COLUMN IF NOT EXISTS "remember" BOOLEAN;
