-- ═══════════════════════════════════════════════════════════════════════════════
-- BUG FIX: log_comments is missing the updated_at column its trigger requires
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Problem (confirmed in production):
--   public.log_comments has a BEFORE UPDATE trigger running set_updated_at(), which
--   assigns `NEW.updated_at = NOW()`. But the table has no updated_at column, so ANY
--   update to a comment row fails with:
--       ERROR 42703: record "new" has no field "updated_at"
--
--   User-visible impact: editing a comment is broken. LogService.addLogComment uses
--   `.upsert(..., { onConflict: 'id' })`; when the comment id already exists the upsert
--   becomes an UPDATE, fires the trigger, and errors. (This is also why the dedupe
--   migration had to disable USER triggers to repoint log_comments rows.)
--
-- Fix: add the column the trigger expects. This matches the schema convention used by
--   the other tables that share set_updated_at(), and requires no app changes
--   (the client doesn't read updated_at today — this just makes the trigger valid).
--
-- Safety:
--   • Idempotent — guarded by IF NOT EXISTS; re-running is a no-op.
--   • Backfills existing rows to created_at (with USER triggers disabled so the
--     trigger doesn't immediately overwrite the backfill with now()).
--   • Single transaction.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Add the column the trigger writes to (nullable first, so the ADD is instant).
ALTER TABLE public.log_comments
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- 2. Backfill existing rows to their created_at (fall back to now() if created_at is
--    null). Disable USER triggers for this one statement so set_updated_at() doesn't
--    clobber the backfilled value with now(). FK/system triggers stay active.
DO $$
BEGIN
  ALTER TABLE public.log_comments DISABLE TRIGGER USER;
  UPDATE public.log_comments
  SET updated_at = COALESCE(created_at, now())
  WHERE updated_at IS NULL;
  ALTER TABLE public.log_comments ENABLE TRIGGER USER;
END $$;

-- 3. Lock in the default + NOT NULL so future inserts are always populated and the
--    trigger has a valid field to assign on every update.
ALTER TABLE public.log_comments
  ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.log_comments
  ALTER COLUMN updated_at SET NOT NULL;

-- Post-condition you can verify after COMMIT:
--   • UPDATE public.log_comments SET body = body WHERE id = (SELECT id FROM public.log_comments LIMIT 1);
--     -- should now succeed instead of raising 42703
--   • SELECT column_name FROM information_schema.columns
--       WHERE table_schema='public' AND table_name='log_comments' AND column_name='updated_at';

COMMIT;
