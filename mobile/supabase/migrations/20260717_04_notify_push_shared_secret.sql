-- ═══════════════════════════════════════════════════════════════════════════════
-- F-5 (HIGH) — authenticate the DB→notify-push webhook call
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠️ APPLY MANUALLY, and DO the two out-of-SQL steps in MANUAL_STEPS (secret + jwt).
--
-- Verified live 2026-07-17: the tg_notify_push trigger calls the notify-push edge
--   function with NO x-function-secret header, and the function's secret gate is
--   optional — so if FUNCTION_SHARED_SECRET is unset / verify_jwt is off, anyone on
--   the internet can POST arbitrary push notifications to any user_id.
--   Fix: send a shared secret from the trigger; require it in the function.
--
-- The secret is stored in Supabase Vault (NOT committed to git). Supabase's hosted
-- `postgres` role cannot `ALTER DATABASE ... SET` a custom GUC (42501), so Vault is
-- the correct home. Store it once (name 'notify_push_secret') and set the function's
-- FUNCTION_SHARED_SECRET env var to the SAME value (see MANUAL_STEPS_2026-07-17.md):
--   select vault.create_secret('<random-secret>', 'notify_push_secret');
--
-- Idempotent (CREATE OR REPLACE). The SECURITY DEFINER owner (postgres) can read
-- vault.decrypted_secrets; a normal caller cannot.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.tg_notify_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'notify_push_secret' LIMIT 1;

  PERFORM net.http_post(
    url     := 'https://wihyqkpoymwcvbprslyz.supabase.co/functions/v1/notify-push',
    headers := jsonb_build_object(
      'Content-Type',     'application/json',
      'x-function-secret', v_secret
    ),
    body    := jsonb_build_object('type', 'INSERT', 'table', 'notifications', 'record', to_jsonb(NEW))
  );
  RETURN NEW;
END;
$$;

-- Trigger definition unchanged; re-assert for idempotency / rebuild safety.
DROP TRIGGER IF EXISTS on_notification_created_push ON public.notifications;
CREATE TRIGGER on_notification_created_push
AFTER INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_push();

-- Post-condition: after setting the DB secret AND the function env var to the same
-- value, real notifications still deliver; a raw POST to notify-push without the
-- header returns 401.
