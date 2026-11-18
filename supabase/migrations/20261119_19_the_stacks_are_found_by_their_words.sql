-- ════════════════════════════════════════════════════════════════════════════
-- 20261119_19 — the house-wide search finds its stacks by their words, never by reading every stack.
-- ════════════════════════════════════════════════════════════════════════════
--   1. Every stacks search walked every public stack under the read rule: search_stacks finds them by
--      their words first and asks the rule of the few found, by pages (review round 13).
--   A new function; the descriptions' index is the car 20261119_06, built before it, so its first
--   search reads both indexes.
-- Undo: mobile/supabase/migrations-down/20261119_19_the_stacks_are_found_by_their_words.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-D4 · the house-wide search finds its stacks by their words, never by reading every stack (review round 13) ──
--   The search's STACKS were read by the phone through PostgREST: public stacks whose title or
--   description held the words, newest first, 21 at a time. The read rule of lists (lists_select_authorized
--   and lists_hide_blocked) was asked of every stack before the words were (no row rule lets a pattern
--   reach an index first: ILIKE is not leakproof), so every search, a rare word or a common one, walked
--   every public stack calling can_view_user_data on each: 349-427 ms at the load house's 20,000 stacks,
--   some 1.8 s at 100,000. search_stacks reads them as the Reel's stack search does
--   (get_filtered_stacks_auth_cursor_v2): the words reach the indexes first, and the rule is asked of
--   the few stacks found.
--   What it finds is what the phone's read found, row for row: a public stack (is_private = false, as
--   the phone filtered) whose title or description holds the words, newest first (created_at, then id),
--   that the read rule lets the reader read: their own ("Users can manage their lists."), or one
--   can_view_user_data lets them read (a public member's, a private member's to their followers), never
--   one by a member hidden_authors() names (one the reader blocked or muted, or who blocked the reader).
--   By pages: the last row's time and id are the next page's cursor. Nothing searched finds nothing. A
--   page is at most 51 rows (the phone asks 21: 20 to show, one to know there is more).
--   The words arrive as the phone's buildSearchPattern made them (the one funnel: its own escapes for
--   % _ \ and *, each of ( ) , standing for any one character), and are read as an ILIKE pattern with
--   the backslash as its escape, as PostgREST read them.
--   How it reads, fastest first:
--     1. a search of three letters or digits in a row is counted by its trigram pieces, to 1,000 at most
--        (lists_title_trigram, and lists_description_trigram, built CONCURRENTLY alone before this);
--     2. fewer than 1,000 stacks hold it: those are read by the indexes, put newest first, and the rule
--        is asked of them in that order until the page is full;
--     3. more, or no three letters in a row (no trigram to read by): the public stacks are walked newest
--        first (idx_lists_created_at_id_desc), each asked the words before the rule, until the page is
--        full: a word many stacks hold fills its page within the first few.
--   Each read is planned for the words it is given (plan_cache_mode), so a rare word and a common one
--   each take the plan that suits them. It runs as the house (SECURITY DEFINER) so the words reach the
--   indexes first.

-- add-only (1): no shipped client uses it: a function this piece makes, dropped first only so the piece runs again, called by no client before it (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.search_stacks(text, timestamp with time zone, uuid, integer);
CREATE FUNCTION public.search_stacks(p_pattern text, p_cursor_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20)
RETURNS TABLE(id uuid, user_id uuid, title text, description text, is_ranked boolean, created_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    SET plan_cache_mode TO 'force_custom_plan'
    AS $$
#variable_conflict use_column
DECLARE
  v_me     uuid := auth.uid();
  v_hidden uuid[];
  v_limit  integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 51);
  v_words  text := '%' || p_pattern || '%';
  -- The cursor as one bound on (created_at, id), newest first: none is the newest stack.
  v_at     timestamp with time zone := COALESCE(p_cursor_at, 'infinity'::timestamp with time zone);
  v_id     uuid := CASE WHEN p_cursor_at IS NULL THEN 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid ELSE p_cursor_id END;
  -- A trigram is three letters or digits in a row: without one, no index can find the words.
  v_pieces boolean := p_pattern ~ '[[:alnum:]]{3}';
  v_few    boolean := false;
  v_page   uuid[];
BEGIN
  IF COALESCE(p_pattern, '') = '' THEN
    RETURN;
  END IF;
  v_hidden := COALESCE((SELECT public.hidden_authors()), '{}'::uuid[]);

  -- 1. Counted by the trigram indexes, to 1,000.
  IF v_pieces THEN
    SELECT count(*) < 1000 INTO v_few
      FROM (SELECT 1 FROM public.lists l
             WHERE l.is_private = false
               AND (l.title ILIKE v_words ESCAPE '\' OR l.description ILIKE v_words ESCAPE '\')
             LIMIT 1000) c;
  END IF;

  IF v_few THEN
    -- 2. The few stacks that hold the words, newest first, the rule asked of each in that order.
    SELECT array_agg(w.id ORDER BY w.created_at DESC, w.id DESC) INTO v_page
      FROM (SELECT m.id, m.created_at
              FROM (SELECT l.id, l.created_at, l.user_id
                      FROM public.lists l
                     WHERE l.is_private = false
                       AND (l.title ILIKE v_words ESCAPE '\' OR l.description ILIKE v_words ESCAPE '\')
                       AND (l.created_at, l.id) < (v_at, v_id)
                    -- Read by the indexes and sorted before any stack is asked the rule.
                    OFFSET 0) m
              LEFT JOIN public.profiles p ON p.id = m.user_id
             WHERE NOT (m.user_id = ANY (v_hidden))
               AND (m.user_id = v_me
                    OR (p.id IS NOT NULL AND NOT COALESCE(p.is_social_private, false))
                    OR public.can_view_user_data(m.user_id))
             ORDER BY m.created_at DESC, m.id DESC
             LIMIT v_limit) w;
  ELSE
    -- 3. Many, or no trigram: the public stacks newest first, each asked the words, then the rule.
    SELECT array_agg(w.id ORDER BY w.created_at DESC, w.id DESC) INTO v_page
      FROM (SELECT l.id, l.created_at
              FROM public.lists l
              LEFT JOIN public.profiles p ON p.id = l.user_id
             WHERE l.is_private = false
               AND (l.created_at, l.id) < (v_at, v_id)
               AND (l.title ILIKE v_words ESCAPE '\' OR l.description ILIKE v_words ESCAPE '\')
               AND NOT (l.user_id = ANY (v_hidden))
               AND (l.user_id = v_me
                    OR (p.id IS NOT NULL AND NOT COALESCE(p.is_social_private, false))
                    OR public.can_view_user_data(l.user_id))
             ORDER BY l.created_at DESC, l.id DESC
             LIMIT v_limit) w;
  END IF;

  RETURN QUERY
  SELECT l.id, l.user_id, l.title, l.description, l.is_ranked, l.created_at
    FROM unnest(v_page) WITH ORDINALITY AS g(list_id, n)
    JOIN public.lists l ON l.id = g.list_id
   ORDER BY g.n;
END $$;

-- add-only (1): no shipped client uses it: a function this piece makes (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.search_stacks(text, timestamp with time zone, uuid, integer) FROM PUBLIC;
-- A visitor searches as a member does (the stacks were read by both): the read rule decides what each finds.
GRANT ALL ON FUNCTION public.search_stacks(text, timestamp with time zone, uuid, integer) TO anon;
GRANT ALL ON FUNCTION public.search_stacks(text, timestamp with time zone, uuid, integer) TO authenticated;
GRANT ALL ON FUNCTION public.search_stacks(text, timestamp with time zone, uuid, integer) TO service_role;
