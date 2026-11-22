-- ════════════════════════════════════════════════════════════════════════════
-- 20261122_04 — the bell counts a member's unread notices to a thousand, then says "more".
-- ════════════════════════════════════════════════════════════════════════════
--   notices_page answered the board and its unread count in one read (20261119_20), but the count
--   read every unread notice of the member: the celebrity of the load house, 50,000 of them at each
--   open of the board. That read grows with a member's audience, and so with the house (the kinds
--   pass, stage C, kind 13: built for millions). The bell only shows a dot, and says the count aloud.
--   Now the count reads at most 1,000 unread notices (the member's unread index, in order) and says
--   whether there are more ('unread_more'), so the board's read is the same size at any house. A
--   phone from before this car reads 'unread' as it did: the count, up to 1,000.
--   And the board's page is read from the front of the member's newest-first index, the plan held
--   (enable_bitmapscan off): planned for any member at once, the house guessed each holds a few dozen
--   notices and gathered all of a member's to sort them, the celebrity's 50,000 for a page of 30
--   (load 44965893141).
-- Undo: mobile/supabase/migrations-down/20261122_04_the_bell_counts_to_a_thousand.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- add-only (3): it only fixes: the board's rows as before, its unread count read to 1,000 with whether there are more (TestFlight build 41 reads 'unread' alone: under 1,000 the same number, past it 1,000; replayed in the rehearsal, under and past a thousand)
CREATE OR REPLACE FUNCTION public.notices_page(p_limit integer DEFAULT 30) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    -- The page is the front of notifications_member_newest, however many the member holds: never every
    -- notice of theirs gathered (a bitmap) and sorted for it.
    SET enable_bitmapscan TO 'off'
    AS $$
  WITH counted AS (
    SELECT count(*) AS n
      FROM (SELECT 1 FROM public.notifications
             WHERE user_id = (SELECT auth.uid()) AND is_read = false
             LIMIT 1001) u
  )
  SELECT jsonb_build_object(
    'rows', COALESCE((
      SELECT jsonb_agg(to_jsonb(n) ORDER BY n.created_at DESC, n.id DESC)
        FROM (SELECT id, user_id, type, from_username, from_user_id, message, is_read, created_at, film_id,
                     poster_path, group_key, title, related_lounge_id, metadata
                FROM public.notifications
               WHERE user_id = (SELECT auth.uid())
               ORDER BY created_at DESC, id DESC
               LIMIT LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100)) n), '[]'::jsonb),
    'unread', (SELECT LEAST(n, 1000) FROM counted),
    'unread_more', (SELECT n > 1000 FROM counted));
$$;
