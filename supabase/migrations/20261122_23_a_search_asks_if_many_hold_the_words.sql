-- ════════════════════════════════════════════════════════════════════════════
-- 20261122_23 — a member search asks whether many hold the words before it gathers who does.
-- ════════════════════════════════════════════════════════════════════════════
--   search_members first gathered every member who holds the words, up to a thousand, by the plan the
--   words want: for one or two letters, the index of the short pieces (20261122_14), which gathers every
--   member who holds them before the first is kept: "m1" gathered 22,248 at 100,000 members, "1" 81,929,
--   in proportion to the house. Now a walk of the first 2,000 handles in their own order asks first:
--   when one in a hundred or more hold the words, the search walks the handles in order (each
--   closeness's page met within a few thousand) and no index that gathers is read for them; fewer, and
--   the gathering is as before.
--   And a handle that begins with the words (its second closeness) is asked of its lower case too, so
--   the planner reads the beginning as one range of 20261122_22's index, never every handle holding a
--   word that starts so (film_1924 for "1924"). The same members in the same order, for every search.
--   Then the members are analysed, so the planner knows the new index's handles.
--   Applied after 20261122_22; if the train stops before this car, the search stands as 20261122_18 left
--   it, answering as before.
-- Undo: mobile/supabase/migrations-down/20261122_23_a_search_asks_if_many_hold_the_words.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- As 20261122_18 left it, but many or few is asked by a bounded walk first, and a handle's beginning is
-- also asked of its lower case, which its index reads.
-- add-only (3): it only fixes: the same members in the same order for every search (the rehearsal replays each search and compares it with the old reading); TestFlight build 41 and the website read it as before
CREATE OR REPLACE FUNCTION public.search_members(p_pattern text, p_handles_only boolean DEFAULT false, p_cursor_closeness integer DEFAULT NULL::integer, p_cursor_username text DEFAULT NULL::text, p_limit integer DEFAULT 20)
RETURNS TABLE(id uuid, username text, avatar_url text, role text, closeness integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_limit  integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 51);
  v_names  boolean := NOT COALESCE(p_handles_only, false);
  v_hidden uuid[];
  v_tests  text[];
  v_few    uuid[];
  v_past   text;
  v_tier   integer;
  v_not    text := '';
  v_got    integer := 0;
  v_n      integer;
  v_short  text := '';
  v_many   boolean;
  v_walk   boolean;
BEGIN
  IF COALESCE(p_pattern, '') = '' THEN
    RETURN;
  END IF;
  v_hidden := COALESCE((SELECT private.hidden_authors())::uuid[], '{}'::uuid[]);
  -- Each closeness's own test, as the one read's CASE asked it. Plain, so the planner reads the words
  -- and their indexes: a WHERE drops a test that is unknown (a name not given), as the CASE did.
  -- The handle that is the words: words with no wildcard left once their escapes are read are one
  -- handle, any case, so the case-blind unique index (profiles_username_lower_unique) finds it at once
  -- (ILIKE is that same lower() on both sides: the equality adds no member and takes none away).
  -- A handle or a name that begins with the words is asked the same of its lower case (ILIKE is lower()
  -- LIKE lower()), so its beginning is found in profiles_username_beginning (20261122_22) or
  -- profiles_display_name_beginning (20261122_17), never by the trigram of a word's start that every
  -- handle or name holding such a word anywhere also holds.
  v_tests := ARRAY[
    format('p.username ILIKE %L ESCAPE %L', p_pattern, '\')
      || CASE WHEN regexp_replace(p_pattern, '\\.', '', 'g') !~ '[%_\\]'
              THEN format(' AND lower(p.username) = lower(%L)', regexp_replace(p_pattern, '\\(.)', '\1', 'g')) ELSE '' END,
    format('p.username ILIKE %L ESCAPE %L AND lower(p.username) LIKE %L ESCAPE %L', p_pattern || '%', '\', lower(p_pattern) || '%', '\'),
    CASE WHEN v_names THEN format('p.display_name ILIKE %L ESCAPE %L AND lower(p.display_name) LIKE %L ESCAPE %L', p_pattern || '%', '\', lower(p_pattern) || '%', '\') ELSE 'false' END,
    format('(p.username ILIKE %L ESCAPE %L', '%' || p_pattern || '%', '\')
      || CASE WHEN v_names THEN format(' OR p.display_name ILIKE %L ESCAPE %L)', '%' || p_pattern || '%', '\') ELSE ')' END
  ];
  -- Words without three letters or digits in a row hold no trigram inside a handle or a name: the
  -- gatherings of who holds them anywhere (the one read's own, and the last closeness) then read by
  -- their one- and two-letter pieces (profiles_short_grams), never member by member through the house,
  -- the words' own test asked inside COALESCE so no plan reads a trigram index for them whole. A handle
  -- or a name that begins with them is found by its trigrams as before (a beginning has its own).
  IF p_pattern !~ '[[:alnum:]]{3}' AND private.pattern_grams(p_pattern) IS NOT NULL THEN
    v_short := format(' AND private.search_grams(p.username, p.display_name) @> %L::text[]', private.pattern_grams(p_pattern));
  END IF;
  -- Many or few, first, by a walk that reads the same number of members at any size of the house: the
  -- first 2,000 handles in their own order (profiles_username_unique), each asked the words' own test.
  -- When 20 or more of them hold the words (one in a hundred), so many do that each closeness's page is
  -- met by walking the handles in order within a few thousand, and the indexes of the pieces and the
  -- trigrams, which gather every member who holds the words before the first is read (22,248 for "m1",
  -- 81,929 for "1" at 100,000 members), are not read for them.
  EXECUTE format('SELECT count(*) FROM (SELECT p.id, p.username, p.display_name FROM public.profiles p ORDER BY p.username LIMIT 2000) p WHERE COALESCE(%s, false) AND NOT COALESCE(p.id = ANY ($1), false)',
                 v_tests[4])
    INTO v_n USING v_hidden;
  v_many := v_n >= 20;
  -- Fewer: who holds the words at all (the one read's own WHERE), gathered once by the plan the words
  -- want, up to a thousand: when fewer hold them, the page is the one read's own over just those few, by id.
  IF NOT v_many THEN
    EXECUTE format('SELECT array_agg(p.id) FROM (SELECT p.id FROM public.profiles p WHERE %s%s AND NOT COALESCE(p.id = ANY ($1), false) LIMIT 1001) p',
                   CASE WHEN v_short = '' THEN v_tests[4] ELSE format('COALESCE(%s, false)', v_tests[4]) END, v_short)
      INTO v_few USING v_hidden;
  END IF;
  IF NOT v_many AND COALESCE(cardinality(v_few), 0) <= 1000 THEN
    RETURN QUERY
    SELECT m.id, m.username, m.avatar_url, m.role, m.closeness
      FROM (
        SELECT p.id, p.username, p.avatar_url, p.role,
               CASE WHEN p.username ILIKE p_pattern ESCAPE '\' THEN 0
                    WHEN p.username ILIKE p_pattern || '%' ESCAPE '\' THEN 1
                    WHEN v_names AND p.display_name ILIKE p_pattern || '%' ESCAPE '\' THEN 2
                    ELSE 3 END AS closeness
          FROM public.profiles p
         WHERE p.id = ANY (COALESCE(v_few, '{}'::uuid[]))
      ) m
     WHERE p_cursor_closeness IS NULL OR (m.closeness, m.username) > (p_cursor_closeness, p_cursor_username)
     ORDER BY m.closeness, m.username
     LIMIT v_limit;
    RETURN;
  END IF;
  -- More hold them: each closeness in turn, as far as the page needs. A member of a closeness meets its
  -- test and none of the closer ones; in the cursor's own closeness, it is past the cursor's handle (a
  -- member with no handle is never past it). Its members are gathered first, up to a thousand, by the
  -- plan the words want: fewer, and they are put in handle order themselves; more, and the closeness
  -- holds so many that its handles are walked in their own order (profiles_username_unique) and the
  -- page is met within the first few hundred. The walk asks its test as one the planner cannot weigh
  -- (COALESCE), so it is planned as a walk however few it guesses: its guess of a name's beginning
  -- once took 100,000 for 4, and sorted them all. When the first walk found many, the last closeness
  -- (who holds the words anywhere) is walked at once, never gathered.
  FOR v_tier IN 0..3 LOOP
    IF (p_cursor_closeness IS NULL OR v_tier >= p_cursor_closeness) AND v_tests[v_tier + 1] <> 'false' THEN
      v_past := CASE WHEN v_tier = p_cursor_closeness THEN format(' AND p.username > %L', p_cursor_username) ELSE '' END;
      v_walk := v_many AND v_tier = 3;
      IF NOT v_walk THEN
        EXECUTE format('SELECT array_agg(p.id) FROM (SELECT p.id FROM public.profiles p WHERE %s%s%s%s AND NOT COALESCE(p.id = ANY ($1), false) LIMIT 1001) p',
                       CASE WHEN v_short = '' OR v_tier < 3 THEN v_tests[v_tier + 1] ELSE format('COALESCE(%s, false)', v_tests[v_tier + 1]) END, v_not, v_past,
                       CASE WHEN v_tier = 3 THEN v_short ELSE '' END)
          INTO v_few USING v_hidden;
        v_walk := COALESCE(cardinality(v_few), 0) > 1000;
      END IF;
      IF NOT v_walk THEN
        RETURN QUERY
        SELECT p.id, p.username, p.avatar_url, p.role, v_tier
          FROM public.profiles p
         WHERE p.id = ANY (COALESCE(v_few, '{}'::uuid[]))
         ORDER BY p.username
         LIMIT v_limit - v_got;
      ELSE
        RETURN QUERY EXECUTE format(
          'SELECT p.id, p.username, p.avatar_url, p.role, %s
             FROM public.profiles p
            WHERE COALESCE(%s, false)%s%s
              AND NOT COALESCE(p.id = ANY ($1), false)
            ORDER BY p.username
            LIMIT %s',
          v_tier, v_tests[v_tier + 1], v_not, v_past, v_limit - v_got)
        USING v_hidden;
      END IF;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_got := v_got + v_n;
      EXIT WHEN v_got >= v_limit;
    END IF;
    -- A closer test ruled out: one that is unknown was not met, so it rules nothing out.
    v_not := v_not || ' AND NOT COALESCE(' || v_tests[v_tier + 1] || ', false)';
  END LOOP;
END;
$$;

-- The new index's handles, known to the planner.
-- add-only (1): no shipped client uses it: statistics, read by the planner alone
ANALYZE public.profiles;
