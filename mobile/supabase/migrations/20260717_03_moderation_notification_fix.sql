-- ═══════════════════════════════════════════════════════════════════════════════
-- F-12 (HIGH — LIVE-BROKEN) — restore moderation report-resolution
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠️ APPLY MANUALLY in the Supabase SQL editor.
--
-- Verified live 2026-07-17: resolve_moderation_report_v2 inserts
--   notifications(user_id, type, title, body, message, metadata) with type='moderation',
--   but on live the notifications table has NO title/body/metadata columns AND its
--   type CHECK forbids 'moderation'. p_notify_user DEFAULTs true, so resolving ANY
--   report (ban/suspend/warn) raises 42703/23514 and rolls back the whole enforcement
--   transaction → the Tribunal cannot act. Moderation is functionally down in prod.
--
-- Fix = schema-additive (lowest risk: no rewrite of the SECURITY DEFINER function).
--   (a) add the columns the resolver writes; (b) extend the type CHECK to permit
--   'moderation', preserving the current 9 values (verified live). The function then
--   succeeds unchanged and `message` continues to drive client rendering.
--   Optional later cleanup: slim the function's INSERT to message-only and drop
--   title/body/metadata — deferred to avoid touching a SECURITY DEFINER body pre-launch.
--
-- Idempotent. Single transaction. The DROP loop removes the type CHECK by whatever
-- it is actually named on live (no assumption about the constraint name).
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- (a) columns the live resolver writes
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS title    text,
  ADD COLUMN IF NOT EXISTS body     text,
  ADD COLUMN IF NOT EXISTS metadata jsonb;

-- (b) permit 'moderation' — drop any existing type CHECK (by real name), recreate with the full list
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.notifications'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%type = ANY%'
  LOOP
    EXECUTE format('ALTER TABLE public.notifications DROP CONSTRAINT %I', r.conname);
  END LOOP;

  ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_type_check
    CHECK (type = ANY (ARRAY[
      'follow','endorse','comment','annotate','retransmit','system',
      'reaction','follow_request','follow_accept','moderation'
    ]::text[]));
END $$;

COMMIT;

-- Post-condition: resolving a report with notify_user=true succeeds; the reporter and
-- the target each receive a 'moderation' notification whose `message` renders in-app.
