-- ════════════════════════════════════════════════════════════════════════════
-- a_search_asks_if_many_hold_the_words_rehearsal.sql — 20261122_23. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_search_asks_if_many_hold_the_words_rehearsal.sql --with-train
--
-- The train applies 20261122_23 here (with_train), every car before it already applied (20261122_22's index
-- among them); a sealed copy already holds it. 20261122_18's search_members is held here, as it was, to
-- compare with. On handles and names it plants (a run of digits at a handle's start, after an underscore
-- and inside a word, in both cases, an underscore and a wildcard), as a member searching: search_members
-- answers every search exactly as 20261122_18's did, the whole page with each closeness and the next page
-- after a cursor; a planted handle that begins with the words is found at the second closeness, one whose
-- later word holds them is not; the search asks many or few by its bounded walk first; and a handle's
-- beginning, as the search asks it, is one range of 20261122_22's index.
-- Every row here is undone with the transaction. Read each NOTICE as  case|expected|got ; the last line
-- is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

\if :{?with_train}
\ir ../../../supabase/migrations/20261122_23_a_search_asks_if_many_hold_the_words.sql
\endif
RESET ROLE;

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
CREATE TEMP TABLE sm_members ON COMMIT DROP AS
  SELECT u.id, row_number() OVER (ORDER BY u.created_at) AS n
    FROM auth.users u JOIN public.profiles p ON p.id = u.id
   WHERE NOT coalesce(p.is_banned, false) AND (p.suspended_until IS NULL OR p.suspended_until <= now())
   ORDER BY u.created_at LIMIT 7;
SELECT pg_temp.rh_need('seven members in good standing', (SELECT count(*) FROM sm_members), 7) AS done \gset rh_
GRANT SELECT ON sm_members TO anon, authenticated;
DELETE FROM public.user_blocks WHERE blocker_id IN (SELECT id FROM sm_members) AND blocked_id IN (SELECT id FROM sm_members);
UPDATE public.profiles SET is_social_private = false WHERE id IN (SELECT id FROM sm_members);
-- Member 7 searches; the six others carry the handles and names.
UPDATE public.profiles p SET username = CASE m.n
    WHEN 1 THEN 'qz1924rh'
    WHEN 2 THEN 'rh_qz1924'
    WHEN 3 THEN 'rhqz1924x'
    WHEN 4 THEN 'qz19_rh'
    WHEN 5 THEN 'rhqzname'
    WHEN 6 THEN 'qzwild_rh' END,
  display_name = CASE m.n WHEN 5 THEN 'Qz1924 Rehearsal' WHEN 6 THEN 'Rehearsal Qz%' ELSE 'Rehearsal ' || m.n END
  FROM sm_members m WHERE m.id = p.id AND m.n <= 6;

-- 20261122_18's search, as it was.
CREATE FUNCTION pg_temp.sm_old(p_pattern text, p_handles_only boolean DEFAULT false, p_cursor_closeness integer DEFAULT NULL::integer, p_cursor_username text DEFAULT NULL::text, p_limit integer DEFAULT 20)
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
  -- A name that begins with the words is asked the same of its lower case (ILIKE is lower() LIKE lower()),
  -- so its beginning is found in profiles_display_name_beginning (20261122_17), never by the trigram of
  -- a word's start that every name holding such a word anywhere also holds.
  v_tests := ARRAY[
    format('p.username ILIKE %L ESCAPE %L', p_pattern, '\')
      || CASE WHEN regexp_replace(p_pattern, '\\.', '', 'g') !~ '[%_\\]'
              THEN format(' AND lower(p.username) = lower(%L)', regexp_replace(p_pattern, '\\(.)', '\1', 'g')) ELSE '' END,
    format('p.username ILIKE %L ESCAPE %L', p_pattern || '%', '\'),
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
  -- Who holds the words at all (the one read's own WHERE), gathered once by the plan the words want,
  -- up to a thousand: when fewer hold them, the page is the one read's own over just those few, by id.
  EXECUTE format('SELECT array_agg(p.id) FROM (SELECT p.id FROM public.profiles p WHERE %s%s AND NOT COALESCE(p.id = ANY ($1), false) LIMIT 1001) p',
                 CASE WHEN v_short = '' THEN v_tests[4] ELSE format('COALESCE(%s, false)', v_tests[4]) END, v_short)
    INTO v_few USING v_hidden;
  IF COALESCE(cardinality(v_few), 0) <= 1000 THEN
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
  -- once took 100,000 for 4, and sorted them all.
  FOR v_tier IN 0..3 LOOP
    IF (p_cursor_closeness IS NULL OR v_tier >= p_cursor_closeness) AND v_tests[v_tier + 1] <> 'false' THEN
      v_past := CASE WHEN v_tier = p_cursor_closeness THEN format(' AND p.username > %L', p_cursor_username) ELSE '' END;
      EXECUTE format('SELECT array_agg(p.id) FROM (SELECT p.id FROM public.profiles p WHERE %s%s%s%s AND NOT COALESCE(p.id = ANY ($1), false) LIMIT 1001) p',
                     CASE WHEN v_short = '' OR v_tier < 3 THEN v_tests[v_tier + 1] ELSE format('COALESCE(%s, false)', v_tests[v_tier + 1]) END, v_not, v_past,
                     CASE WHEN v_tier = 3 THEN v_short ELSE '' END)
        INTO v_few USING v_hidden;
      IF COALESCE(cardinality(v_few), 0) <= 1000 THEN
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
GRANT EXECUTE ON FUNCTION pg_temp.sm_old(text, boolean, integer, text, integer) TO authenticated;

-- What member 7 finds for each search by either search: the page in order, with each closeness; and the
-- next page of three after the first three.
CREATE FUNCTION pg_temp.sm_finds(p_old boolean) RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE v jsonb := '{}'::jsonb; w text; h boolean; first jsonb; c integer; u text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM sm_members WHERE n = 7), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  FOREACH w IN ARRAY ARRAY['qz1924', 'QZ1924', 'qz19', 'qz', 'q', '1924', 'qz19\_', 'qz19_', 'q%rh', 'rh', 'qzname', 'qz1924 re', 'Qz\%', '\%', 'zzzzqq'] LOOP
    FOREACH h IN ARRAY ARRAY[false, true] LOOP
      IF p_old THEN
        SELECT coalesce(jsonb_agg(jsonb_build_array(f.id, f.closeness, f.username)), '[]'::jsonb) INTO first FROM pg_temp.sm_old(w, h, NULL, NULL, 51) f;
      ELSE
        SELECT coalesce(jsonb_agg(jsonb_build_array(f.id, f.closeness, f.username)), '[]'::jsonb) INTO first FROM public.search_members(w, h, NULL, NULL, 51) f;
      END IF;
      v := v || jsonb_build_object(w || '|' || h, first);
      IF jsonb_array_length(first) > 3 THEN
        c := (first -> 2 ->> 1)::int; u := first -> 2 ->> 2;
        IF p_old THEN
          v := v || jsonb_build_object(w || '|' || h || '|next', (SELECT coalesce(jsonb_agg(jsonb_build_array(f.id, f.closeness)), '[]'::jsonb) FROM pg_temp.sm_old(w, h, c, u, 3) f));
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
CREATE TEMP TABLE sm_now ON COMMIT DROP AS SELECT pg_temp.sm_finds(false) AS r;
CREATE TEMP TABLE sm_was ON COMMIT DROP AS SELECT pg_temp.sm_finds(true) AS r;

-- The planted members a search found at one closeness.
CREATE FUNCTION pg_temp.sm_at(w text, k integer) RETURNS text LANGUAGE sql AS $f$
  SELECT coalesce(string_agg(m.n::text, ',' ORDER BY m.n), 'none')
    FROM sm_now, jsonb_array_elements(r -> (w || '|false')) e
    JOIN sm_members m ON m.id = (e ->> 0)::uuid
   WHERE (e ->> 1)::int = k
$f$;
SELECT pg_temp.rh_need('searches replayed', (SELECT count(*) FROM sm_now, jsonb_object_keys(r)), 30) AS done \gset rh_
SELECT pg_temp.rh_case('every search answers as 20261122_18''s did, the whole page and the next', 'none',
  coalesce((SELECT string_agg(k, '; ') FROM sm_now n, sm_was w, jsonb_object_keys(n.r || w.r) k
             WHERE (n.r -> k) IS DISTINCT FROM (w.r -> k)), 'none')) AS done \gset rh_
SELECT pg_temp.rh_case('a handle that begins with the words is found at the second closeness, in either case; a later word''s is not', '1|1|2,3',
  (SELECT pg_temp.sm_at('qz1924', 1)) || '|' || (SELECT pg_temp.sm_at('QZ1924', 1)) || '|' || (SELECT pg_temp.sm_at('qz1924', 3))) AS done \gset rh_
SELECT pg_temp.rh_case('an escaped underscore is read as itself, a bare one as any one letter', '4|1,4',
  (SELECT pg_temp.sm_at('qz19\_', 1)) || '|' || (SELECT pg_temp.sm_at('qz19_', 1))) AS done \gset rh_

-- On a sealed copy alone (plan_checks, which e2e/db/rehearsals.mjs sets): a plan is chosen by statistics,
-- and a copy of production carries its rows without them; the Load's plan guards hold the bound at size.
\if :{?plan_checks}
SET LOCAL enable_seqscan = off;
SET LOCAL enable_bitmapscan = off;
CREATE FUNCTION pg_temp.sm_plan() RETURNS text LANGUAGE plpgsql AS $f$
DECLARE v text := ''; r record;
BEGIN
  FOR r IN EXECUTE format('EXPLAIN SELECT p.id FROM public.profiles p WHERE p.username ILIKE %L ESCAPE %L AND lower(p.username) LIKE %L ESCAPE %L LIMIT 1001',
                          'qz1924%', '\', lower('qz1924') || '%', '\') LOOP
    v := v || r."QUERY PLAN" || ' ';
  END LOOP;
  RETURN v;
END $f$;
SELECT pg_temp.rh_case('search_members asks many or few by its bounded walk first, and a handle''s beginning of its lower case', 'true|true',
  (position('ORDER BY p.username LIMIT 2000' in pg_get_functiondef('public.search_members(text, boolean, integer, text, integer)'::regprocedure)) > 0)::text || '|'
    || (position('lower(p.username) LIKE %L' in pg_get_functiondef('public.search_members(text, boolean, integer, text, integer)'::regprocedure)) > 0)::text) AS done \gset rh_
SELECT pg_temp.rh_case('a handle''s beginning, as the search asks it, is one range of an index of the handles'' lower case', 'true',
  pg_temp.rh_reads_by((SELECT pg_temp.sm_plan()), 'profiles', 'lower(username)')::text) AS done \gset rh_
\endif
SELECT pg_temp.rh_case('the members are analysed with the index of their handles'' beginnings', 'true',
  (EXISTS (SELECT 1 FROM pg_stats WHERE schemaname = 'public' AND tablename = 'profiles_username_beginning'))::text) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
