-- ════════════════════════════════════════════════════════════════════════════
-- a_beginning_is_gathered_as_one_range_rehearsal.sql — 20261122_29. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_beginning_is_gathered_as_one_range_rehearsal.sql
--
-- 20261122_29 is applied on production (the train of 2026-11-24); this shows it still holds there, and on every sealed copy.
-- 20261122_23's search_members is held here, as it was, to compare with. It plants 1,050
-- members whose handles begin with one run of letters and whose names begin with another (so a search of
-- either has more than a thousand to walk), and a few handles and names around them (a run after an
-- underscore, inside a word, a wildcard). As a member searching: search_members answers every search
-- exactly as 20261122_23's did, the whole page with each closeness and the next page after a cursor; a
-- handle that begins with the words is walked from where such handles start; and a beginning is
-- gathered as one range, in its index's own order.
-- Every row here is undone with the transaction. Read each NOTICE as  case|expected|got ; the last line
-- is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

RESET ROLE;

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
CREATE TEMP TABLE br_members ON COMMIT DROP AS
  SELECT u.id, row_number() OVER (ORDER BY u.created_at) AS n
    FROM auth.users u JOIN public.profiles p ON p.id = u.id
   WHERE NOT coalesce(p.is_banned, false) AND (p.suspended_until IS NULL OR p.suspended_until <= now())
   ORDER BY u.created_at LIMIT 5;
SELECT pg_temp.rh_need('five members in good standing', (SELECT count(*) FROM br_members), 5) AS done \gset rh_
GRANT SELECT ON br_members TO anon, authenticated;
DELETE FROM public.user_blocks WHERE blocker_id IN (SELECT id FROM br_members) AND blocked_id IN (SELECT id FROM br_members);
-- Member 5 searches; the four others carry handles and names around the planted runs.
UPDATE public.profiles p SET username = CASE m.n WHEN 1 THEN 'rh_qzw1' WHEN 2 THEN 'rhqzw2x' WHEN 3 THEN 'qzv_rh' WHEN 4 THEN 'qzx1_rh' END,
  display_name = CASE m.n WHEN 1 THEN 'Rehearsal Qzn' WHEN 2 THEN 'Qzm Rehearsal' ELSE 'Rehearsal ' || m.n END
  FROM br_members m WHERE m.id = p.id AND m.n <= 4;

-- 1,050 members: handles qzw0001.., names "Qzn 1".. (the house makes each profile from the handle asked).
INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at, email_confirmed_at)
SELECT ('5eed0000-0000-4000-8000-0000b29' || lpad(g::text, 5, '0'))::uuid,
       'authenticated', 'authenticated', 'qzw' || lpad(g::text, 4, '0') || '@rehearsal.test',
       jsonb_build_object('username', 'qzw' || lpad(g::text, 4, '0')), '{"provider":"email"}'::jsonb, now(), now(), now()
  FROM generate_series(1, 1050) g;
UPDATE public.profiles SET display_name = 'Qzn ' || substr(username, 4), is_social_private = false
 WHERE id IN (SELECT ('5eed0000-0000-4000-8000-0000b29' || lpad(g::text, 5, '0'))::uuid FROM generate_series(1, 1050) g);
SELECT pg_temp.rh_need('1,050 members planted', (SELECT count(*) FROM public.profiles WHERE username LIKE 'qzw____'), 1050) AS done \gset rh_

-- 20261122_23's search, as it was.
CREATE FUNCTION pg_temp.br_old(p_pattern text, p_handles_only boolean DEFAULT false, p_cursor_closeness integer DEFAULT NULL::integer, p_cursor_username text DEFAULT NULL::text, p_limit integer DEFAULT 20)
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
GRANT EXECUTE ON FUNCTION pg_temp.br_old(text, boolean, integer, text, integer) TO authenticated;

-- What member 5 finds for each search by either search: the page in order, with each closeness; and the
-- next page of three after the first three.
CREATE FUNCTION pg_temp.br_finds(p_old boolean) RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE v jsonb := '{}'::jsonb; w text; h boolean; first jsonb; c integer; u text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM br_members WHERE n = 5), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  FOREACH w IN ARRAY ARRAY['qzw', 'QZW', 'qzw1', 'qzw10', 'qzw0999', 'qzn', 'Qzn 10', 'qz', 'q', 'qzw\_', 'qzv_', 'qz%1', '\%', 'qzm', 'zzzzqq'] LOOP
    FOREACH h IN ARRAY ARRAY[false, true] LOOP
      IF p_old THEN
        SELECT coalesce(jsonb_agg(jsonb_build_array(f.id, f.closeness, f.username)), '[]'::jsonb) INTO first FROM pg_temp.br_old(w, h, NULL, NULL, 51) f;
      ELSE
        SELECT coalesce(jsonb_agg(jsonb_build_array(f.id, f.closeness, f.username)), '[]'::jsonb) INTO first FROM public.search_members(w, h, NULL, NULL, 51) f;
      END IF;
      v := v || jsonb_build_object(w || '|' || h, first);
      IF jsonb_array_length(first) > 3 THEN
        c := (first -> 2 ->> 1)::int; u := first -> 2 ->> 2;
        IF p_old THEN
          v := v || jsonb_build_object(w || '|' || h || '|next', (SELECT coalesce(jsonb_agg(jsonb_build_array(f.id, f.closeness)), '[]'::jsonb) FROM pg_temp.br_old(w, h, c, u, 3) f));
        ELSE
          v := v || jsonb_build_object(w || '|' || h || '|next', (SELECT coalesce(jsonb_agg(jsonb_build_array(f.id, f.closeness)), '[]'::jsonb) FROM public.search_members(w, h, c, u, 3) f));
        END IF;
      END IF;
    END LOOP;
  END LOOP;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v;
END $f$;
CREATE TEMP TABLE br_now ON COMMIT DROP AS SELECT pg_temp.br_finds(false) AS r;
CREATE TEMP TABLE br_was ON COMMIT DROP AS SELECT pg_temp.br_finds(true) AS r;

SELECT pg_temp.rh_need('searches replayed', (SELECT count(*) FROM br_now, jsonb_object_keys(r)), 40) AS done \gset rh_
SELECT pg_temp.rh_case('every search answers as 20261122_23''s did, the whole page and the next', 'none',
  coalesce((SELECT string_agg(k, '; ') FROM br_now n, br_was w, jsonb_object_keys(n.r || w.r) k
             WHERE (n.r -> k) IS DISTINCT FROM (w.r -> k)), 'none')) AS done \gset rh_
SELECT pg_temp.rh_case('more than a thousand handles begin with the words: the page is the first of them in handle order, at the second closeness', 'qzw0001|1|51',
  (SELECT (r -> 'qzw|false' -> 0 ->> 2) || '|' || (r -> 'qzw|false' -> 0 ->> 1) || '|' || jsonb_array_length(r -> 'qzw|false') FROM br_now)) AS done \gset rh_
SELECT pg_temp.rh_case('the search''s walk starts where such handles start, and its beginnings are gathered in their index''s order', 'true|true|true',
  (position('p.username >= LEAST(upper(%L), lower(%L))' in pg_get_functiondef('public.search_members(text, boolean, integer, text, integer)'::regprocedure)) > 0)::text || '|'
    || (position('ORDER BY lower(p.username) USING ~<~' in pg_get_functiondef('public.search_members(text, boolean, integer, text, integer)'::regprocedure)) > 0)::text || '|'
    || (position('COALESCE(p.username ILIKE %L ESCAPE %L, false) AND lower(p.username) LIKE' in pg_get_functiondef('public.search_members(text, boolean, integer, text, integer)'::regprocedure)) > 0)::text) AS done \gset rh_
SELECT pg_temp.rh_case('the planner settings the search turns off for a beginning are as they were after it', 'on|on',
  current_setting('enable_bitmapscan') || '|' || current_setting('enable_sort')) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
