-- ════════════════════════════════════════════════════════════════════════════
-- the_reels_stack_search_reads_its_page_by_id_rehearsal.sql — 20261122_26. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs the_reels_stack_search_reads_its_page_by_id_rehearsal.sql
--
-- 20261122_26 is applied on production (the train of 2026-11-24); this shows it still holds there, and on every sealed copy.
-- 20261122_15's get_filtered_stacks_auth_cursor_v2 is held here, as it was, to compare
-- with. On stacks it plants (many new ones holding a word, many by an author whose handle holds another,
-- a few old ones, a private one, a withheld one, and one by a member the searcher blocked), as a member
-- searching: the Reel's stack search answers every search exactly as 20261122_15's did, the whole page and
-- the next page after a cursor, at two page sizes; a word many of the newest stacks hold is walked; and
-- the page is read by id, with many asked of the newest stacks first.
-- Every row here is undone with the transaction. Read each NOTICE as  case|expected|got ; the last line
-- is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

RESET ROLE;

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
CREATE TEMP TABLE rs_members ON COMMIT DROP AS
  SELECT u.id, row_number() OVER (ORDER BY u.created_at) AS n
    FROM auth.users u JOIN public.profiles p ON p.id = u.id
   WHERE NOT coalesce(p.is_banned, false) AND (p.suspended_until IS NULL OR p.suspended_until <= now())
   ORDER BY u.created_at LIMIT 6;
SELECT pg_temp.rh_need('six members in good standing', (SELECT count(*) FROM rs_members), 6) AS done \gset rh_
GRANT SELECT ON rs_members TO anon, authenticated;
DELETE FROM public.user_blocks WHERE blocker_id IN (SELECT id FROM rs_members) AND blocked_id IN (SELECT id FROM rs_members);
UPDATE public.profiles SET is_social_private = false WHERE id IN (SELECT id FROM rs_members);
UPDATE public.profiles p SET username = 'qzauthor' FROM rs_members m WHERE m.id = p.id AND m.n = 2;
-- Member 6 searches, and has blocked member 4.
INSERT INTO public.user_blocks (blocker_id, blocked_id, type)
SELECT (SELECT id FROM rs_members WHERE n = 6), (SELECT id FROM rs_members WHERE n = 4), 'block';

-- Fourteen of the newest stacks hold "qzmany"; twelve more are by qzauthor; a few old ones hold "qzfew",
-- with a private one and a withheld one; and one by the blocked member holds "qzmany" too.
INSERT INTO public.lists (user_id, title, description, is_private, created_at)
SELECT (SELECT id FROM rs_members WHERE n = 1), 'Qzmany stack ' || g, 'planted', false, now() + g * interval '1 second'
  FROM generate_series(1, 14) g;
INSERT INTO public.lists (user_id, title, description, is_private, created_at)
SELECT (SELECT id FROM rs_members WHERE n = 2), 'Plain stack ' || g, 'planted', false, now() + (20 + g) * interval '1 second'
  FROM generate_series(1, 12) g;
INSERT INTO public.lists (user_id, title, description, is_private, created_at)
SELECT (SELECT id FROM rs_members WHERE n = 3), t, 'planted', p, now() - interval '400 days' + g * interval '1 second'
  FROM (VALUES (1, 'Qzfew one', false), (2, 'Qzfew two', false), (3, 'Qzfew secret', true), (4, 'Qzfew held', false)) v(g, t, p);
UPDATE public.lists SET withheld_at = now() WHERE title = 'Qzfew held' AND description = 'planted';
INSERT INTO public.lists (user_id, title, description, is_private, created_at)
SELECT (SELECT id FROM rs_members WHERE n = 4), 'Qzmany hidden', 'planted', false, now() + interval '15 seconds';
SELECT pg_temp.rh_need('stacks planted', (SELECT count(*) FROM public.lists WHERE description = 'planted'), 31) AS done \gset rh_

-- 20261122_15's search, as it was.
CREATE FUNCTION pg_temp.rs_old(p_search text DEFAULT ''::text, p_filter_following boolean DEFAULT false, p_limit integer DEFAULT 60, p_cursor_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid, p_poster_count integer DEFAULT 4) RETURNS TABLE(id uuid, title text, description text, username text, user_id uuid, created_at timestamp with time zone, films jsonb, film_count bigint, certify_count bigint, is_ranked boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  WITH
  -- A search's one- and two-letter pieces, when it has no three letters or digits in a row; none when it
  -- is all wildcards (then it walks). Read by them, the words' own test is asked inside COALESCE, so no
  -- plan reads a trigram index for them whole (it holds nothing to find them by).
  short AS MATERIALIZED (
    SELECT CASE WHEN p_search !~ '[[:alnum:]]{3}'
                THEN private.pattern_grams('%' || like_escape(COALESCE(p_search, '')) || '%') END AS grams
  ),
  -- A search that matches many stacks walks them newest first, as with no search, and stops
  -- at its page; one that matches few is read by its matches. Counted by the trigram indexes,
  -- to 1,000 at most (load 43284739569: the walk 6.5 ms for a word every stack has and 292.7
  -- for a handle; the matches 94.7 and 4.4).
  -- Without three letters or digits in a row no trigram index can find a word (it is made of three-
  -- letter pieces; "m1" counted by them took 506.9 ms, load 43292798767): such a search is counted by
  -- its one- and two-letter pieces instead (lists_short_grams, profiles_short_grams), and walks only
  -- when it has none (all wildcards).
  many AS MATERIALIZED (
    SELECT CASE WHEN COALESCE(p_search, '') = '' OR (p_search !~ '[[:alnum:]]{3}' AND (SELECT grams FROM short) IS NULL) THEN true
                WHEN p_search !~ '[[:alnum:]]{3}' THEN (
      SELECT count(*) >= 1000 FROM (
        SELECT l.id FROM lists l
         WHERE l.is_private = false
           AND private.search_grams(l.title, l.description) @> (SELECT grams FROM short)
           AND COALESCE(l.title ILIKE '%' || like_escape(p_search) || '%' ESCAPE '\', false)
        UNION ALL
        SELECT l.id FROM profiles pu
         CROSS JOIN LATERAL (SELECT l.id FROM lists l WHERE l.user_id = pu.id AND l.is_private = false OFFSET 0) l
         WHERE private.search_grams(pu.username, pu.display_name) @> (SELECT grams FROM short)
           AND COALESCE(pu.username ILIKE '%' || like_escape(p_search) || '%' ESCAPE '\', false)
        LIMIT 1000
      ) counted_short)
                ELSE (
      SELECT count(*) >= 1000 FROM (
        SELECT l.id FROM lists l
         WHERE l.is_private = false
           AND l.title ILIKE '%' || like_escape(p_search) || '%' ESCAPE '\'
        UNION ALL
        -- Each member whose handle holds the words, then their stacks by their own index (OFFSET 0
        -- keeps it a lookup per member): never every stack of the house read to be joined.
        SELECT l.id FROM profiles pu
         CROSS JOIN LATERAL (SELECT l.id FROM lists l WHERE l.user_id = pu.id AND l.is_private = false OFFSET 0) l
         WHERE pu.username ILIKE '%' || like_escape(p_search) || '%' ESCAPE '\'
        LIMIT 1000
      ) counted) END AS walk
  ),
  -- The matches of a few, newest first, before anything is asked of them.
  matched AS MATERIALIZED (
    SELECT m.id, m.created_at, m.user_id FROM (
      SELECT l.id, l.created_at, l.user_id
        FROM lists l
       WHERE COALESCE(p_search, '') <> '' AND NOT (SELECT walk FROM many) AND l.is_private = false
         AND p_search ~ '[[:alnum:]]{3}'
         AND l.withheld_at IS NULL
         AND l.title ILIKE '%' || like_escape(p_search) || '%' ESCAPE '\'
      UNION
      SELECT l.id, l.created_at, l.user_id
        FROM lists l
       WHERE COALESCE(p_search, '') <> '' AND NOT (SELECT walk FROM many) AND l.is_private = false
         AND p_search !~ '[[:alnum:]]{3}'
         AND private.search_grams(l.title, l.description) @> (SELECT grams FROM short)
         AND l.withheld_at IS NULL
         AND COALESCE(l.title ILIKE '%' || like_escape(p_search) || '%' ESCAPE '\', false)
      UNION
      SELECT l.id, l.created_at, l.user_id
        FROM profiles pu
       CROSS JOIN LATERAL (SELECT l.id, l.created_at, l.user_id FROM lists l
                            WHERE l.user_id = pu.id AND l.is_private = false AND l.withheld_at IS NULL OFFSET 0) l
       WHERE COALESCE(p_search, '') <> '' AND NOT (SELECT walk FROM many)
         AND p_search ~ '[[:alnum:]]{3}'
         AND pu.username ILIKE '%' || like_escape(p_search) || '%' ESCAPE '\'
      UNION
      SELECT l.id, l.created_at, l.user_id
        FROM profiles pu
       CROSS JOIN LATERAL (SELECT l.id, l.created_at, l.user_id FROM lists l
                            WHERE l.user_id = pu.id AND l.is_private = false AND l.withheld_at IS NULL OFFSET 0) l
       WHERE COALESCE(p_search, '') <> '' AND NOT (SELECT walk FROM many)
         AND p_search !~ '[[:alnum:]]{3}'
         AND private.search_grams(pu.username, pu.display_name) @> (SELECT grams FROM short)
         AND COALESCE(pu.username ILIKE '%' || like_escape(p_search) || '%' ESCAPE '\', false)
    ) m
     WHERE p_cursor_created_at IS NULL OR (m.created_at, m.id) < (p_cursor_created_at, p_cursor_id)
     ORDER BY m.created_at DESC, m.id DESC
  ),
  page AS (
    -- No search, or a search of many: today's walk, today's test of each stack.
    (SELECT l.id, l.created_at
       FROM lists l
      WHERE (COALESCE(p_search, '') = '' OR (SELECT walk FROM many))
        AND (
          COALESCE(p_search, '') = ''
          OR l.title ILIKE '%' || like_escape(p_search) || '%' ESCAPE '\'
          -- The author's handle, looked up as the walk reaches each stack (a scalar subquery is
          -- never folded into a join): the walk stops at its page, never reading every member
          -- whose handle holds the word (today's IN (...) did, 219.4 ms for "m1").
          OR (SELECT pu.username FROM profiles pu WHERE pu.id = l.user_id)
               ILIKE '%' || like_escape(p_search) || '%' ESCAPE '\'
        )
        AND l.is_private = false
        -- a stack the house withholds is on no shelf (H-B10)
        AND l.withheld_at IS NULL
        AND NOT COALESCE(l.user_id = ANY ((SELECT private.hidden_authors())::uuid[]), false)
        AND private.can_view_user_data(l.user_id)
        AND (p_filter_following = false OR EXISTS (
              SELECT 1 FROM interactions i
               WHERE i.target_user_id = l.user_id AND i.user_id = auth.uid() AND i.type = 'follow'))
        AND (p_cursor_created_at IS NULL OR (l.created_at, l.id) < (p_cursor_created_at, p_cursor_id))
      ORDER BY l.created_at DESC, l.id DESC
      LIMIT p_limit)
    UNION ALL
    -- Read in the order it was kept (newest first), each asked only as it is reached.
    (SELECT m.id, m.created_at
       FROM matched m
      WHERE NOT COALESCE(m.user_id = ANY ((SELECT private.hidden_authors())::uuid[]), false)
        AND private.can_view_user_data(m.user_id)
        AND (p_filter_following = false OR EXISTS (
              SELECT 1 FROM interactions i
               WHERE i.target_user_id = m.user_id AND i.user_id = auth.uid() AND i.type = 'follow'))
      LIMIT p_limit)
  )
  SELECT
    l.id, l.title, l.description,
    p.username, l.user_id, l.created_at,
    COALESCE(
      (SELECT jsonb_agg(f ORDER BY f_created_at ASC)
       FROM (
         SELECT jsonb_build_object('id', li.film_id, 'title', li.film_title,
                                   'poster_path', li.poster_path) AS f,
                li.created_at AS f_created_at
         FROM list_items li
         WHERE li.list_id = l.id AND li.poster_path IS NOT NULL
         ORDER BY li.created_at ASC
         LIMIT LEAST(GREATEST(p_poster_count, 0), 10)
       ) top_films),
      '[]'::jsonb
    ) AS films,
    (SELECT COUNT(*) FROM list_items li WHERE li.list_id = l.id) AS film_count,
    public.list_certify_count(l.id) AS certify_count,
    l.is_ranked
  FROM page pg
  JOIN lists l ON l.id = pg.id
  JOIN profiles p ON p.id = l.user_id
  ORDER BY l.created_at DESC, l.id DESC;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.rs_old(text, boolean, integer, timestamp with time zone, uuid, integer) TO authenticated;

-- What member 6 finds for each search by either reading: the page in order, at sixty and at five, and
-- the next three after the first three.
CREATE FUNCTION pg_temp.rs_finds(p_old boolean) RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE v jsonb := '{}'::jsonb; w text; k integer; first jsonb; at timestamptz; id uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT m.id FROM rs_members m WHERE m.n = 6), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  FOREACH w IN ARRAY ARRAY['qzmany', 'QZMANY', 'qzauthor', 'qzfew', 'qz', 'q', 'zq', 'plain', 'stack', '%', '_', 'qzmany stack 1', ''] LOOP
    FOREACH k IN ARRAY ARRAY[60, 5] LOOP
      IF p_old THEN
        SELECT coalesce(jsonb_agg(jsonb_build_array(f.id, f.title, f.username, f.film_count) ORDER BY f.created_at DESC, f.id DESC), '[]'::jsonb) INTO first FROM pg_temp.rs_old(w, false, k) f;
      ELSE
        SELECT coalesce(jsonb_agg(jsonb_build_array(f.id, f.title, f.username, f.film_count) ORDER BY f.created_at DESC, f.id DESC), '[]'::jsonb) INTO first FROM public.get_filtered_stacks_auth_cursor_v2(w, false, k) f;
      END IF;
      v := v || jsonb_build_object(w || '|' || k, first);
      IF jsonb_array_length(first) > 3 THEN
        id := (first -> 2 ->> 0)::uuid;
        at := (SELECT l.created_at FROM public.lists l WHERE l.id = (first -> 2 ->> 0)::uuid);
        IF p_old THEN
          v := v || jsonb_build_object(w || '|' || k || '|next', (SELECT coalesce(jsonb_agg(f.id ORDER BY f.created_at DESC, f.id DESC), '[]'::jsonb) FROM pg_temp.rs_old(w, false, 3, at, id) f));
        ELSE
          v := v || jsonb_build_object(w || '|' || k || '|next', (SELECT coalesce(jsonb_agg(f.id ORDER BY f.created_at DESC, f.id DESC), '[]'::jsonb) FROM public.get_filtered_stacks_auth_cursor_v2(w, false, 3, at, id) f));
        END IF;
      END IF;
    END LOOP;
  END LOOP;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v;
END $f$;
CREATE TEMP TABLE rs_now ON COMMIT DROP AS SELECT pg_temp.rs_finds(false) AS r;
CREATE TEMP TABLE rs_was ON COMMIT DROP AS SELECT pg_temp.rs_finds(true) AS r;

-- The planted titles a search found, at sixty.
CREATE FUNCTION pg_temp.rs_titles(w text) RETURNS text LANGUAGE sql AS $f$
  SELECT coalesce(string_agg(e ->> 1, ',' ORDER BY e ->> 1), 'none')
    FROM rs_now, jsonb_array_elements(r -> (w || '|60')) e
   WHERE (e ->> 1) LIKE 'Qzfew%' OR (e ->> 1) = 'Qzmany hidden'
$f$;
SELECT pg_temp.rh_need('searches replayed', (SELECT count(*) FROM rs_now, jsonb_object_keys(r)), 30) AS done \gset rh_
SELECT pg_temp.rh_case('every search answers as 20261122_15''s did, the whole page and the next, at sixty and at five', 'none',
  coalesce((SELECT string_agg(k, '; ') FROM rs_now n, rs_was w, jsonb_object_keys(n.r || w.r) k
             WHERE (n.r -> k) IS DISTINCT FROM (w.r -> k)), 'none')) AS done \gset rh_
-- qzauthor's open stacks: the twelve planted, and any the seed gave the member.
SELECT pg_temp.rh_case('the many are found, and every open stack of the author; a private, a withheld and a blocked author''s stack are not',
  '14|' || (SELECT count(*) FROM public.lists l WHERE l.user_id = (SELECT id FROM rs_members WHERE n = 2) AND NOT l.is_private AND l.withheld_at IS NULL)::text || '|Qzfew one,Qzfew two',
  (SELECT jsonb_array_length(r -> 'qzmany|60') FROM rs_now)::text || '|' || (SELECT jsonb_array_length(r -> 'qzauthor|60') FROM rs_now)::text
    || '|' || (SELECT pg_temp.rs_titles('qzfew'))) AS done \gset rh_

SELECT pg_temp.rh_case('the page is read by id, and many is asked of the newest 300 stacks first', 'true|true',
  (position('FROM lists l WHERE l.id = pg.id OFFSET 0) l' in pg_get_functiondef('public.get_filtered_stacks_auth_cursor_v2(text, boolean, integer, timestamp with time zone, uuid, integer)'::regprocedure)) > 0)::text || '|'
    || (position('LIMIT 300) w' in pg_get_functiondef('public.get_filtered_stacks_auth_cursor_v2(text, boolean, integer, timestamp with time zone, uuid, integer)'::regprocedure)) > 0)::text) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
