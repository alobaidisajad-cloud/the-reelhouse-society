-- ════════════════════════════════════════════════════════════════════════════
-- 20261119_18 — a member's marks are read in one trip at launch.
-- ════════════════════════════════════════════════════════════════════════════
--   1. Every launch read the member's whole ledger of marks a thousand rows a page, page after page:
--      get_marks_ledger reads it in one trip, the member's own and no one else's (review round 13).
--   A new function; nothing else changes.
-- Undo: mobile/supabase/migrations-down/20261119_18_the_marks_are_read_in_one_trip.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-D2 · a member's marks are read in one trip at launch (review round 13) ──
--   Every launch, and every sign-in, the phone read the member's whole ledger of marks (each film
--   logged, with its status, rating, viewings and date, and each film kept on the watchlist) a
--   thousand rows a page, one page after another: for a record of 10,000 films, eleven round trips in
--   a row and 3.17 MB, some 375-406 ms of database time (the load house's whale, as themselves), each
--   page asking the logs' read rule of every row it read, and the launch's own first reads waiting
--   behind it. get_marks_ledger reads them in one trip: each column of the member's logs as one array,
--   in one order, and the films they keep, one pass over their own records by logs_user_film_idx (some
--   25-40 ms for the whale, 1.24 MB). Nothing a row does not need is sent (no member id on every row,
--   no time it was written, no key repeated per row).
--   It answers only the member asking, and only their own records: the read rule the phone's read went
--   through, applied as it reads for one's own rows. "Users can manage their logs" (and their
--   watchlists) let a member read every row of their own, and logs_hide_blocked hides a row whose
--   author hidden_authors() names: asked once here, of the member themselves. A visitor has no ledger:
--   nothing is answered (null), and the function is not granted to anon.
--   A new function; nothing else changes. A phone from before reads its pages as it did.

-- add-only (1): no shipped client uses it: a function this piece makes, dropped first only so the piece runs again, called by no client before it (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.get_marks_ledger();
CREATE FUNCTION public.get_marks_ledger() RETURNS json
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  WITH me AS MATERIALIZED (
    -- The member asking, and whether the logs' read rule would hide their own rows from them.
    SELECT (SELECT auth.uid()) AS id,
           COALESCE((SELECT auth.uid()) = ANY ((SELECT public.hidden_authors())::uuid[]), false) AS hidden
  )
  SELECT json_build_object(
    -- One pass over the member's logs; every column is gathered in the same order, so the i-th of each
    -- is the same log.
    'logs', (SELECT json_build_object(
               'id', COALESCE(array_agg(l.id), '{}'),
               'film_id', COALESCE(array_agg(l.film_id), '{}'),
               'film_title', COALESCE(array_agg(l.film_title), '{}'),
               'poster_path', COALESCE(array_agg(l.poster_path), '{}'),
               'year', COALESCE(array_agg(l.year), '{}'),
               'status', COALESCE(array_agg(l.status), '{}'),
               'rating', COALESCE(array_agg(l.rating), '{}'),
               'view_count', COALESCE(array_agg(l.view_count), '{}'),
               'watched_date', COALESCE(array_agg(l.watched_date), '{}'))
               FROM public.logs l
              WHERE l.user_id = me.id AND NOT me.hidden),
    'saved', (SELECT to_json(COALESCE(array_agg(w.film_id), '{}'))
                FROM public.watchlists w
               WHERE w.user_id = me.id AND NOT me.hidden))
    FROM me
   WHERE me.id IS NOT NULL;
$$;

-- add-only (1): no shipped client uses it: a function this piece makes (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.get_marks_ledger() FROM PUBLIC;
-- add-only (1): no shipped client uses it: a function this piece makes; a visitor has no ledger (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.get_marks_ledger() FROM anon;
GRANT ALL ON FUNCTION public.get_marks_ledger() TO authenticated;
GRANT ALL ON FUNCTION public.get_marks_ledger() TO service_role;
