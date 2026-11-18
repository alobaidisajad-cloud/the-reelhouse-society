-- ════════════════════════════════════════════════════════════════════════════
-- 20261119_20 — the notices board and its unread count are read in one moment.
-- ════════════════════════════════════════════════════════════════════════════
--   1. The board and the bell's unread count were two reads at two moments, so the bell could count a
--      notice the board did not hold: notices_page answers both from one statement (review round 13).
--   A new function; nothing else changes. A phone from before reads the two as it did.
-- Undo: mobile/supabase/migrations-down/20261119_20_the_board_and_its_count_are_one_read.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-A6 · the notices board and its unread count are read in one moment (review round 13) ────────
--   The board read its newest notices and the bell's unread count as two reads, each at its own
--   moment: a notice that arrived between the two was in one and not the other, so the bell could
--   count a notice the board did not hold, or miss one it did, until a later read; and the phone
--   laying a notice heard live over the answer could not know which of the two had seen it.
--   notices_page answers the caller's newest notices (the board's columns, newest first, by
--   created_at then id, at most 100) and their unread count from one statement: one snapshot, one
--   round trip where there were two. It runs as the caller, so the notices' own rules (each member's
--   own, none from a member they hid) shape the page and the count alike, as they shaped both reads.

-- add-only (1): no shipped client uses it: a function this piece makes, dropped first only so the piece runs again, called by no shipped client (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.notices_page(integer);
CREATE FUNCTION public.notices_page(p_limit integer DEFAULT 30) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT jsonb_build_object(
    'rows', COALESCE((
      SELECT jsonb_agg(to_jsonb(n) ORDER BY n.created_at DESC, n.id DESC)
        FROM (SELECT id, user_id, type, from_username, from_user_id, message, is_read, created_at, film_id,
                     poster_path, group_key, title, related_lounge_id, metadata
                FROM public.notifications
               WHERE user_id = (SELECT auth.uid())
               ORDER BY created_at DESC, id DESC
               LIMIT LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100)) n), '[]'::jsonb),
    'unread', (SELECT count(*) FROM public.notifications
                WHERE user_id = (SELECT auth.uid()) AND is_read = false));
$$;
-- add-only (1): no shipped client uses it: a function this piece makes, called by no shipped client (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.notices_page(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notices_page(integer) TO authenticated, service_role;
