-- ════════════════════════════════════════════════════════════════════════════
-- BATCH 29 · PART 1 — remove a live privacy bypass
-- ════════════════════════════════════════════════════════════════════════════
--
-- public.get_following_feed(text[], integer, integer) is SECURITY DEFINER, so it
-- runs with the database's own rights and NEVER consults RLS. The logs table is
-- guarded by `logs_select_authorized USING can_view_user_data(user_id)`; this
-- function reads straight past it and filters on nothing but a list of usernames.
--
-- PROVEN ON PRODUCTION 2026-08-10, inside a rolled-back transaction:
--   sealed a member (is_social_private = true), then asked as `anon`:
--     can_view_user_data(them) ......... false
--     their reviews via the logs table .. 0
--     their reviews via this function ... 1  ← the review text came back
--   and over plain HTTP with the public anon key, no login at all:
--     POST /rest/v1/rpc/get_following_feed → 200, review body returned.
--
-- NOT HARDENED, DROPPED — because nothing calls it:
--   · no `.rpc('get_following_feed')` in mobile or web at ANY commit in history
--     (checked every commit, exact quoted name);
--   · absent from scripts/backend-contract.json;
--   · the shipped TestFlight build (buildNumber 40, commit 6efec29) does not
--     call it — checked that commit directly, not just today's tree;
--   · the app uses get_following_feed_auth_cursor, which is SECURITY INVOKER,
--     so RLS applies to it normally.
-- Every other feed function was checked for the same flaw: all nine are INVOKER
-- or gate explicitly. This was the only outlier.
--
-- ── RESTORE SCRIPT ──────────────────────────────────────────────────────────
-- If this ever needs to come back, it must come back GATED. Paste this, and
-- keep the two added lines — without them the bypass returns:
--
--   CREATE OR REPLACE FUNCTION public.get_following_feed(
--     p_usernames text[], p_limit integer DEFAULT 40, p_offset integer DEFAULT 0)
--   RETURNS TABLE(id uuid, film_id integer, film_title text, poster_path text,
--     rating numeric, review text, drop_cap boolean, status text,
--     created_at timestamptz, year text, user_id uuid, editorial_header text,
--     pull_quote text, watched_with text, is_autopsied boolean, autopsy jsonb,
--     username text, avatar_url text, role text)
--   LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
--     SELECT l.id, l.film_id, l.film_title, l.poster_path, l.rating, l.review,
--            l.drop_cap, l.status, l.created_at, l.year, l.user_id,
--            l.editorial_header, l.pull_quote, l.watched_with, l.is_autopsied,
--            l.autopsy, p.username, p.avatar_url, p.role
--       FROM public.logs l
--       INNER JOIN public.profiles p ON p.id = l.user_id
--      WHERE p.username = ANY(p_usernames)
--        AND l.review IS NOT NULL AND l.review <> ''
--        AND public.can_view_user_data(l.user_id)          -- ← the gate
--        AND NOT public.is_hidden_by(auth.uid(), l.user_id) -- ← blocks
--      ORDER BY l.created_at DESC
--      LIMIT p_limit OFFSET p_offset;
--   $fn$;
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_count int;
  v_args  text;
BEGIN
  SET LOCAL lock_timeout = '3s';
  SET LOCAL statement_timeout = '30s';

  SELECT count(*), max(pg_get_function_identity_arguments(p.oid))
    INTO v_count, v_args
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_following_feed';

  IF v_count = 0 THEN
    RAISE NOTICE 'get_following_feed is already gone — nothing to drop.';
  ELSIF v_count > 1 THEN
    -- An overload would mean somebody added a variant this analysis never saw.
    -- Dropping the wrong one, or dropping one that IS called, is the failure
    -- mode worth aborting for.
    RAISE EXCEPTION
      'ABORTED — expected exactly one get_following_feed, found %. Re-verify callers before dropping.', v_count;
  ELSIF v_args <> 'p_usernames text[], p_limit integer, p_offset integer' THEN
    RAISE EXCEPTION
      'ABORTED — signature is (%), not the one verified as uncalled. Re-verify before dropping.', v_args;
  ELSE
    DROP FUNCTION public.get_following_feed(text[], integer, integer);
    RAISE NOTICE 'Dropped public.get_following_feed — the anon-reachable privacy bypass.';
  END IF;
END $$;

-- ── While we are here: close the one dead-subsystem function that anonymous
-- callers can still reach. The venue/ticket feature was removed from both apps
-- long ago; book_showtime_seat survives as a definer RPC that WRITES to
-- public.showtimes and is granted to anon. Batch 31 drops the subsystem with its
-- tables — this only takes away the public door in the meantime.
-- Verified: no client calls it at any commit, including the shipped build.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = 'book_showtime_seat') THEN
    REVOKE ALL ON FUNCTION public.book_showtime_seat(uuid, text, text) FROM PUBLIC, anon, authenticated;
    RAISE NOTICE 'Revoked public access to the dead book_showtime_seat RPC.';
  END IF;
END $$;

-- PostgREST caches the function list; without this the dropped RPC lingers in
-- its schema cache and keeps answering until the next reload.
NOTIFY pgrst, 'reload schema';
