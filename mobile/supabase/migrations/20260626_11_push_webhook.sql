-- ════════════════════════════════════════════════════════════════════════════
-- Push delivery webhook — notifications INSERT → notify-push — APPLIED 2026-06-27
-- ════════════════════════════════════════════════════════════════════════════
-- ⚠️ do NOT `supabase db push` — see WAVE0_LIVE_NOTES.md. Applied via SQL editor.
--
-- Completes the server side of mobile push (#5). The notify-push edge function
-- (Expo sender) is deployed; this fires it on every new notification. Uses pg_net
-- directly (the project's supabase_functions webhook schema wasn't provisioned).
-- Non-blocking (net.http_post queues the request).
--
-- STILL REQUIRED for real delivery (launch): configure Expo push credentials
-- (FCM for Android, APNs for iOS) in the EAS project, then device-test.
-- ════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.tg_notify_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://wihyqkpoymwcvbprslyz.supabase.co/functions/v1/notify-push',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := jsonb_build_object('type', 'INSERT', 'table', 'notifications', 'record', to_jsonb(NEW))
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_notification_created_push ON public.notifications;
CREATE TRIGGER on_notification_created_push
AFTER INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_push();
