-- ════════════════════════════════════════════════════════════════════════════
-- 20261111_01 — a notice is pushed once, in its own words.
-- ════════════════════════════════════════════════════════════════════════════
--   tg_notify_push sends each new notice to notify-push through pg_net, with
--   the function's shared secret in a header. While that request waits in
--   net.http_request_queue, any role that can log in may read it: pg_net's
--   grants to PUBLIC are Supabase's, which it cannot narrow for one project
--   (support, SU-546605, 2026-11-10). Only Supabase's own roles can log in
--   (who_can_log_in_check.sql), but a secret read there let its reader send any
--   member any words. notify-push now takes a notice's id alone, reads the
--   notice from the house, and claims it while fresh (pushed_at, set once by the
--   service role): whoever holds the secret can push only a notice already
--   due, once, as the house wrote it.
--   pushed_at is the house's: a member's own update keeps it as it was (the row
--   keeps what it is, a_row_keeps_what_it_is, which lets the service role and
--   postgres through). A plain column with no default: added in place, no
--   rewrite. Notices written before it are never pushed again (notify-push
--   pushes only one written in its last fifteen minutes).
-- Rehearsal: mobile/supabase/diagnostics/a_push_is_sent_once_rehearsal.sql
-- Undo: mobile/supabase/migrations-down/20261111_01_a_push_is_sent_once.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- add-only (1): no shipped client uses it: a column this migration makes, named by no client before it (TestFlight build 41 and the website checked)
ALTER TABLE public.notifications ADD COLUMN pushed_at timestamptz;

-- As live, with pushed_at kept from a member's own update.
-- add-only (3): it only fixes: a member's update of their notice (is_read, the only column any client writes) lands as before; replayed as the member in a_push_is_sent_once_rehearsal.sql
DROP TRIGGER a_keeps_what_it_is ON public.notifications;
-- add-only (3): it only fixes: the same trigger, keeping one more column, the house's own (pushed_at), which no client writes; a member's update of their notice replayed as the member in a_push_is_sent_once_rehearsal.sql
CREATE TRIGGER a_keeps_what_it_is BEFORE UPDATE ON public.notifications FOR EACH ROW
  EXECUTE FUNCTION public.a_row_keeps_what_it_is('user_id', 'type', 'from_user_id', 'from_username', 'related_lounge_id',
    'film_id', 'poster_path', 'title', 'body', 'message', 'metadata', 'group_key', 'created_at', 'pushed_at');
