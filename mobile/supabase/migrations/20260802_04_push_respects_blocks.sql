-- ═══════════════════════════════════════════════════════════════════════════════
-- Batch 11 · a blocked person could still buzz your lock screen
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠️ APPLY MANUALLY in the Supabase SQL editor (do NOT `supabase db push`).
-- ⚠️ NO EDGE FUNCTION DEPLOY. NO APP BUILD. Works on the current TestFlight build.
--
-- ── WHAT WAS WRONG ────────────────────────────────────────────────────────────
-- 20260802_02 stopped a blocked member's notifications from appearing IN the app,
-- but the push banner is not sent by the app. An AFTER INSERT trigger on
-- public.notifications (on_notification_created_push → tg_notify_push) POSTs to the
-- notify-push edge function, which runs as service_role and therefore bypasses row
-- level security entirely. The RESTRICTIVE policy cannot touch it.
--
-- So: block someone, their notification is correctly hidden from your list, and
-- their next endorsement still lights up your lock screen with their username.
--
-- ── WHY THE FIX IS HERE AND NOT IN THE EDGE FUNCTION ─────────────────────────
-- Stopping it at the trigger means no deploy: the push is simply never requested.
-- That also avoids editing notify-push, whose two copies in this repo already
-- differ from each other (161 vs 126 lines), so neither can be assumed to match
-- what is deployed. Fixing it in SQL sidesteps that entirely — and it is strictly
-- better, because the HTTP call is never made rather than made and discarded.
--
-- ── ⚠️ THE TRAP THIS AVOIDS, MEASURED ────────────────────────────────────────
-- The obvious one-liner is `is_hidden_by(NEW.user_id, NEW.from_user_id)`. It is
-- WRONG HERE and fails silently.
--
-- is_hidden_by ignores its viewer_id argument and reads auth.uid(). Inside this
-- trigger auth.uid() is the ACTOR — whoever just did the thing that created the
-- notification — not the recipient. So it asks "does this person hide themselves?",
-- answers no, and filters nothing while looking entirely correct in review.
--
-- Proven on a throwaway Postgres, both versions, same data, blocked actor:
--     is_hidden_by(NEW.user_id, NEW.from_user_id)  -> 1 push sent  ❌
--     explicit recipient/actor EXISTS check        -> 0 pushes     ✅
--
-- Hence the inline check below. It mirrors is_hidden_by's semantics exactly —
-- hide if the RECIPIENT blocked or muted the actor, or if the ACTOR blocked the
-- recipient (block only; a mute is private and one-directional) — but names both
-- people explicitly instead of inferring one from the session.
--
-- ── EVERYTHING ELSE IS PRESERVED ─────────────────────────────────────────────
-- The vault secret lookup and the x-function-secret header from
-- 20260717_04_notify_push_shared_secret are untouched. Only the guard is added.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.tg_notify_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_secret text;
BEGIN
  -- Do not ask for a push the recipient has chosen not to receive.
  -- NULL from_user_id is a system notice and must always deliver.
  IF NEW.from_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE (blocker_id = NEW.user_id      AND blocked_id = NEW.from_user_id)
       OR (blocker_id = NEW.from_user_id AND blocked_id = NEW.user_id AND type = 'block')
  ) THEN
    RETURN NEW;   -- AFTER trigger: the row is already stored, the push is skipped
  END IF;

  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'notify_push_secret' LIMIT 1;

  PERFORM net.http_post(
    url     := 'https://wihyqkpoymwcvbprslyz.supabase.co/functions/v1/notify-push',
    headers := jsonb_build_object(
      'Content-Type',      'application/json',
      'x-function-secret', v_secret
    ),
    body    := jsonb_build_object('type', 'INSERT', 'table', 'notifications', 'record', to_jsonb(NEW))
  );
  RETURN NEW;
END;
$$;

-- ── Verify (run after) ────────────────────────────────────────────────────────
--   SELECT prosrc LIKE '%blocker_id = NEW.user_id%' AS guard_present
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public' AND p.proname='tg_notify_push';
--   -- must be true
--
--   In the app: block someone, then have them endorse one of your logs. No banner.
--   Unblock them, repeat: the banner returns.
--
-- ── Proven on a replica ───────────────────────────────────────────────────────
--   blocked actor            -> no push
--   muted actor              -> no push
--   actor blocked YOU        -> no push (mutual)
--   unblocked member         -> push delivered
--   system notice (no actor) -> push delivered
--
-- ── Rollback ──────────────────────────────────────────────────────────────────
-- Re-run 20260717_04_notify_push_shared_secret.sql, which is this function without
-- the guard.
