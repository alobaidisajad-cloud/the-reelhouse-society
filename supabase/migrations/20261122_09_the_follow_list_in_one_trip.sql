-- ════════════════════════════════════════════════════════════════════════════
-- 20261122_09 — a member's follow list is read in one trip at launch.
-- ════════════════════════════════════════════════════════════════════════════
--   At each launch the phone reads whom the member follows and has asked to follow, so every Follow
--   button is drawn true. It read the list a thousand at a time, each page waiting on the last: a
--   member who follows 5,000 waited on five trips before the list was known, and past 10,000 the
--   list was never read whole (the kinds pass, stage C, kind 13: a serial page walk at launch).
--   Now get_my_follows answers the whole list in one read, as get_marks_ledger answers the marks:
--   the handles the member follows and the handles they asked to follow, each in the order they
--   were made, under the member's own rules (it runs as the member, so the interactions' and the
--   profiles' rules read it exactly as the old pages did). A visitor has no list to ask for.
-- Undo: mobile/supabase/migrations-down/20261122_09_the_follow_list_in_one_trip.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- add-only (1): no shipped client uses it: a function this piece makes, dropped first so it is made new (no grant it did not ask for), called by no shipped client (TestFlight build 41 and the website read the pages)
DROP FUNCTION IF EXISTS public.get_my_follows();
CREATE FUNCTION public.get_my_follows() RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  -- One pass over the member's own follows and requests, each with its handle; both lists in the
  -- order the follows were made.
  SELECT jsonb_build_object(
    'following', COALESCE(jsonb_agg(p.username ORDER BY i.created_at, i.id) FILTER (WHERE i.type = 'follow'), '[]'::jsonb),
    'requested', COALESCE(jsonb_agg(p.username ORDER BY i.created_at, i.id) FILTER (WHERE i.type = 'follow_request'), '[]'::jsonb))
    FROM public.interactions i
    JOIN public.profiles p ON p.id = i.target_user_id
   WHERE i.user_id = (SELECT auth.uid())
     AND i.type IN ('follow', 'follow_request');
$$;
-- add-only (1): no shipped client uses it: a function this piece makes, for members alone
REVOKE ALL ON FUNCTION public.get_my_follows() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_follows() TO authenticated;
COMMENT ON FUNCTION public.get_my_follows() IS 'The caller''s follow list in one read, for the phone at launch: the handles they follow and the handles they asked to follow, each in the order made. Runs as the caller, under the interactions'' and profiles'' own rules.';
