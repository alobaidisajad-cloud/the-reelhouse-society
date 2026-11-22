-- ════════════════════════════════════════════════════════════════════════════
-- a_member_is_found_among_the_first_holders_of_a_piece_rehearsal.sql — 20261122_62. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_member_is_found_among_the_first_holders_of_a_piece_rehearsal.sql --with-train
--
-- The train applies 20261122_62 here (with_train), every car before it already applied; a sealed copy
-- already holds it. 20261122_29's search_members is held here, as it was, to compare with. It plants
-- 1,050 members whose handles begin "qzw" and whose names begin "Qzn ", and 1,050 more whose handles begin
-- "qzb" and whose names begin "Bn 1" (so each of their pieces is held past a thousand), and a few handles and
-- names around them. Then members join, are renamed and leave, past a list's last handle and before it,
-- until a piece lists every holder again and then too many once more.
-- After every write: each piece the planted members ever held lists exactly its holders up to its last
-- listed handle (every holder when it lists them all), counts them all, and lists at most a thousand. As a
-- member searching: search_members answers every search exactly as 20261122_29's did (the page, with each
-- closeness, and the next after a cursor), but a search whose holders lie past every list it could read,
-- which says TOO_WIDE; and a name's beginning held past a thousand is walked in its piece's list, never
-- the handles. No member reads the lists.
-- Every row here is undone with the transaction. Read each NOTICE as  case|expected|got ; the last line
-- is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

\if :{?with_train}
\ir ../../../supabase/migrations/20261122_62_a_member_is_found_among_the_first_holders_of_a_piece.sql
\endif
RESET ROLE;

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
CREATE TEMP TABLE mg_members ON COMMIT DROP AS
  SELECT u.id, row_number() OVER (ORDER BY u.created_at) AS n
    FROM auth.users u JOIN public.profiles p ON p.id = u.id
   WHERE NOT coalesce(p.is_banned, false) AND (p.suspended_until IS NULL OR p.suspended_until <= now())
   ORDER BY u.created_at LIMIT 5;
SELECT pg_temp.rh_need('five members in good standing', (SELECT count(*) FROM mg_members), 5) AS done \gset rh_
GRANT SELECT ON mg_members TO anon, authenticated;
DELETE FROM public.user_blocks WHERE blocker_id IN (SELECT id FROM mg_members) AND blocked_id IN (SELECT id FROM mg_members);
-- Member 5 searches; the four others carry handles and names around the planted runs.
UPDATE public.profiles p SET username = CASE m.n WHEN 1 THEN 'rh_qzw1' WHEN 2 THEN 'rhqzw2x' WHEN 3 THEN 'qzv_rh' WHEN 4 THEN 'qzx1_rh' END,
  display_name = CASE m.n WHEN 1 THEN 'Rehearsal Qzn' WHEN 2 THEN 'Qzm Rehearsal' ELSE 'Rehearsal ' || m.n END
  FROM mg_members m WHERE m.id = p.id AND m.n <= 4;

-- 2,100 members (the house makes each profile from the handle asked): qzw0001.. named "Qzn 0001..", and
-- qzb0001.. named "Bn 1001..".
INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at, email_confirmed_at)
SELECT ('5eed0000-0000-4000-8000-0000b' || f.code || lpad(g::text, 5, '0'))::uuid,
       'authenticated', 'authenticated', f.lead || lpad(g::text, 4, '0') || '@rehearsal.test',
       jsonb_build_object('username', f.lead || lpad(g::text, 4, '0')), '{"provider":"email"}'::jsonb, now(), now(), now()
  FROM generate_series(1, 1050) g, (VALUES ('62', 'qzw'), ('63', 'qzb')) f(code, lead);
UPDATE public.profiles SET display_name = CASE WHEN username LIKE 'qzw%' THEN 'Qzn ' || substr(username, 4) ELSE 'Bn 1' || substr(username, 5) END,
       is_social_private = false
 WHERE username ~ '^qz[wb][0-9]{4}$';
SELECT pg_temp.rh_case('the joined wait for their transaction to settle: no piece of theirs is listed yet', '0|true',
  (SELECT count(*)::text FROM private.member_gram_heads WHERE gram = 'aqzw') || '|' || (SELECT count(*) > 2000 FROM private.member_grams_waiting WHERE txid = txid_current())::text) AS done \gset rh_
-- Settled now, as the commit would settle them.
SET CONSTRAINTS a_members_pieces_are_settled IMMEDIATE;
SET CONSTRAINTS a_members_pieces_are_settled DEFERRED;
SELECT pg_temp.rh_need('2,100 members planted', (SELECT count(*) FROM public.profiles WHERE username ~ '^qz[wb][0-9]{4}$'), 2100) AS done \gset rh_

-- Every piece the planted members hold, and will have held.
CREATE TEMP TABLE mg_pieces ON COMMIT DROP AS
  SELECT DISTINCT g FROM public.profiles p, unnest(private.member_grams_of(p.username, p.display_name)) g
   WHERE p.username ~ '^qz[wb][0-9]{4}$' OR p.id IN (SELECT id FROM mg_members)
  UNION SELECT unnest(private.member_grams_of('qzc0005', 'Bn 1005')) UNION SELECT unnest(private.member_grams_of('qzd1040', 'Bn 1040'))
  UNION SELECT unnest(private.member_grams_of('qzb0000a', NULL)) UNION SELECT unnest(private.member_grams_of('qzb2001', NULL))
  UNION SELECT unnest(private.member_grams_of('qzb2002', NULL));

-- What each piece should hold, read again from the house: its holders, and whether its list is exact up
-- to its last listed handle (every holder, when it lists them all) and never past a thousand.
CREATE FUNCTION pg_temp.mg_lists_wrong() RETURNS text LANGUAGE sql AS $f$
  WITH held AS (
    SELECT g.g AS gram, p.username, p.id
      FROM public.profiles p CROSS JOIN LATERAL unnest(private.member_grams_of(p.username, p.display_name)) g(g)
     WHERE g.g IN (SELECT g FROM mg_pieces)
  ), counted AS (
    SELECT c.g AS gram, count(h.gram) AS holders FROM mg_pieces c LEFT JOIN held h ON h.gram = c.g GROUP BY c.g
  ), actual AS (
    SELECT m.gram, m.username, m.id FROM private.member_grams m WHERE m.gram IN (SELECT g FROM mg_pieces)
  ), listed AS (
    SELECT a.gram, count(*) AS n, max(a.username) AS last FROM actual a GROUP BY a.gram
  ), expected AS (
    SELECT h.gram, h.username, h.id FROM held h JOIN private.member_gram_heads hd ON hd.gram = h.gram
     WHERE hd.upto IS NULL OR h.username <= hd.upto
  ), wrong AS (
    SELECT c.gram FROM counted c LEFT JOIN private.member_gram_heads h ON h.gram = c.gram LEFT JOIN listed l ON l.gram = c.gram
     WHERE coalesce(h.holders, 0) <> c.holders OR coalesce(h.listed, 0) <> coalesce(l.n, 0) OR coalesce(h.listed, 0) > 1000
        OR (h.upto IS NOT NULL AND h.upto IS DISTINCT FROM l.last)
    UNION SELECT e.gram FROM (SELECT * FROM expected EXCEPT SELECT * FROM actual) e
    UNION SELECT x.gram FROM (SELECT * FROM actual EXCEPT SELECT * FROM expected) x
  )
  SELECT coalesce(string_agg(gram, ' ' ORDER BY gram), 'none') FROM wrong
$f$;
CREATE FUNCTION pg_temp.mg_head(p_gram text) RETURNS text LANGUAGE sql AS $f$
  SELECT coalesce((SELECT h.holders || '|' || h.listed || '|' || coalesce(h.upto, 'every') FROM private.member_gram_heads h WHERE h.gram = p_gram), 'none')
$f$;

SELECT pg_temp.rh_case('2,100 joined: every piece lists its holders up to its last, and counts them all', 'none', pg_temp.mg_lists_wrong()) AS done \gset rh_
SELECT pg_temp.rh_case('a piece held by 1,050 lists the first thousand in handle order, and counts all', '1050|1000|qzb1000', pg_temp.mg_head('aqzb')) AS done \gset rh_
SELECT pg_temp.rh_case('a handle''s piece, for a search of handles alone, is kept as well', '1050|1000|qzb1000', pg_temp.mg_head('hqzb')) AS done \gset rh_

-- Renamed out of a list, and out of the piece altogether; one leaves; one joins before the list's last.
UPDATE public.profiles SET username = 'qzc0005' WHERE username = 'qzb0005';
DELETE FROM public.profiles WHERE username = 'qzb0010';
INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at, email_confirmed_at)
VALUES ('5eed0000-0000-4000-8000-0000b6400001', 'authenticated', 'authenticated', 'qzb0000a@rehearsal.test',
        '{"username": "qzb0000a"}'::jsonb, '{"provider":"email"}'::jsonb, now(), now(), now());
-- Renamed past the list's last: counted off, the list as it was.
UPDATE public.profiles SET username = 'qzd1040' WHERE username = 'qzb1040';
-- Settled now, as the commit would settle them.
SET CONSTRAINTS a_members_pieces_are_settled IMMEDIATE;
SET CONSTRAINTS a_members_pieces_are_settled DEFERRED;
SELECT pg_temp.rh_case('renamed, left and joined: every piece lists its holders up to its last, and counts them all', 'none', pg_temp.mg_lists_wrong()) AS done \gset rh_
SELECT pg_temp.rh_case('two went from the list and one came: 999 listed, 1,048 counted, the last as it was', '1048|999|qzb1000', pg_temp.mg_head('aqzb')) AS done \gset rh_

-- Every holder past the list's last leaves: the piece lists every holder again.
DELETE FROM public.profiles WHERE username ~ '^qzb1[0-9]{3}$' AND username > 'qzb1000';
-- Settled now, as the commit would settle them.
SET CONSTRAINTS a_members_pieces_are_settled IMMEDIATE;
SET CONSTRAINTS a_members_pieces_are_settled DEFERRED;
SELECT pg_temp.rh_case('every holder past the last gone: the piece lists every holder', '999|999|every', pg_temp.mg_head('aqzb')) AS done \gset rh_
-- Two more join: one past a thousand, and the last listed goes.
INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at, email_confirmed_at)
SELECT ('5eed0000-0000-4000-8000-0000b65' || lpad(g::text, 5, '0'))::uuid, 'authenticated', 'authenticated', 'qzb2' || lpad(g::text, 3, '0') || '@rehearsal.test',
       jsonb_build_object('username', 'qzb2' || lpad(g::text, 3, '0')), '{"provider":"email"}'::jsonb, now(), now(), now()
  FROM generate_series(1, 2) g;
-- Settled now, as the commit would settle them.
SET CONSTRAINTS a_members_pieces_are_settled IMMEDIATE;
SET CONSTRAINTS a_members_pieces_are_settled DEFERRED;
SELECT pg_temp.rh_case('a thousand and one: the last listed goes and the list ends before it', '1001|1000|qzb2001', pg_temp.mg_head('aqzb')) AS done \gset rh_
SELECT pg_temp.rh_case('after every write: every piece lists its holders up to its last, and counts them all', 'none', pg_temp.mg_lists_wrong()) AS done \gset rh_
SELECT pg_temp.rh_case('no member reads the lists', 'false|false|false|false',
  has_table_privilege('authenticated', 'private.member_grams', 'SELECT')::text || '|' || has_table_privilege('anon', 'private.member_grams', 'SELECT')::text || '|'
  || has_table_privilege('authenticated', 'private.member_gram_heads', 'SELECT')::text || '|' || has_function_privilege('authenticated', 'private.member_grams_apply(private.member_grams[], private.member_grams[])', 'EXECUTE')::text) AS done \gset rh_

-- 20261122_29's search, as it was.
CREATE FUNCTION pg_temp.mg_old(p_pattern text, p_handles_only boolean DEFAULT false, p_cursor_closeness integer DEFAULT NULL::integer, p_cursor_username text DEFAULT NULL::text, p_limit integer DEFAULT 20)
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
  v_bitmap text := current_setting('enable_bitmapscan');
  v_sort   text := current_setting('enable_sort');
  v_lead   text := regexp_replace(substring(COALESCE(p_pattern, '') from '^((?:[^%_\\]|\\.)*)'), '\\(.)', '\1', 'g');
BEGIN
  IF COALESCE(p_pattern, '') = '' THEN
    RETURN;
  END IF;
  v_hidden := COALESCE((SELECT private.hidden_authors())::uuid[], '{}'::uuid[]);
  v_tests := ARRAY[
    format('p.username ILIKE %L ESCAPE %L', p_pattern, '\')
      || CASE WHEN regexp_replace(p_pattern, '\\.', '', 'g') !~ '[%_\\]'
              THEN format(' AND lower(p.username) = lower(%L)', regexp_replace(p_pattern, '\\(.)', '\1', 'g')) ELSE '' END,
    format('COALESCE(p.username ILIKE %L ESCAPE %L, false) AND lower(p.username) LIKE %L ESCAPE %L', p_pattern || '%', '\', lower(p_pattern) || '%', '\'),
    CASE WHEN v_names THEN format('COALESCE(p.display_name ILIKE %L ESCAPE %L, false) AND lower(p.display_name) LIKE %L ESCAPE %L', p_pattern || '%', '\', lower(p_pattern) || '%', '\') ELSE 'false' END,
    format('(p.username ILIKE %L ESCAPE %L', '%' || p_pattern || '%', '\')
      || CASE WHEN v_names THEN format(' OR p.display_name ILIKE %L ESCAPE %L)', '%' || p_pattern || '%', '\') ELSE ')' END
  ];
  IF p_pattern !~ '[[:alnum:]]{3}' AND private.pattern_grams(p_pattern) IS NOT NULL THEN
    v_short := format(' AND private.search_grams(p.username, p.display_name) @> %L::text[]', private.pattern_grams(p_pattern));
  END IF;
  EXECUTE format('SELECT count(*) FROM (SELECT p.id, p.username, p.display_name FROM public.profiles p ORDER BY p.username LIMIT 2000) p WHERE COALESCE(%s, false) AND NOT COALESCE(p.id = ANY ($1), false)',
                 v_tests[4])
    INTO v_n USING v_hidden;
  v_many := v_n >= 20;
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
  FOR v_tier IN 0..3 LOOP
    IF (p_cursor_closeness IS NULL OR v_tier >= p_cursor_closeness) AND v_tests[v_tier + 1] <> 'false' THEN
      v_past := CASE WHEN v_tier = p_cursor_closeness THEN format(' AND p.username > %L', p_cursor_username) ELSE '' END;
      v_walk := v_many AND v_tier = 3;
      IF NOT v_walk THEN
        IF v_tier IN (1, 2) THEN PERFORM set_config('enable_bitmapscan', 'off', true); PERFORM set_config('enable_sort', 'off', true); END IF;
        EXECUTE format('SELECT array_agg(p.id) FROM (SELECT p.id FROM public.profiles p WHERE %s%s%s%s AND NOT COALESCE(p.id = ANY ($1), false)%s LIMIT 1001) p',
                       CASE WHEN v_short = '' OR v_tier < 3 THEN v_tests[v_tier + 1] ELSE format('COALESCE(%s, false)', v_tests[v_tier + 1]) END, v_not, v_past,
                       CASE WHEN v_tier = 3 THEN v_short ELSE '' END,
                       CASE v_tier WHEN 1 THEN ' ORDER BY lower(p.username) USING ~<~' WHEN 2 THEN ' ORDER BY lower(p.display_name) USING ~<~' ELSE '' END)
          INTO v_few USING v_hidden;
        IF v_tier IN (1, 2) THEN PERFORM set_config('enable_bitmapscan', v_bitmap, true); PERFORM set_config('enable_sort', v_sort, true); END IF;
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
            WHERE COALESCE(%s, false)%s%s%s
              AND NOT COALESCE(p.id = ANY ($1), false)
            ORDER BY p.username
            LIMIT %s',
          v_tier, v_tests[v_tier + 1], v_not, v_past,
          CASE WHEN v_tier = 1 AND v_lead <> '' THEN format(' AND p.username >= LEAST(upper(%L), lower(%L))', v_lead, v_lead) ELSE '' END,
          v_limit - v_got)
        USING v_hidden;
      END IF;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_got := v_got + v_n;
      EXIT WHEN v_got >= v_limit;
    END IF;
    v_not := v_not || ' AND NOT COALESCE(' || v_tests[v_tier + 1] || ', false)';
  END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.mg_old(text, boolean, integer, text, integer) TO authenticated;

-- What member 5 finds for each search by either search: the page of 21 in order, with each closeness; and
-- the next page of three after the first three. A search that says TOO_WIDE is written as such.
CREATE FUNCTION pg_temp.mg_finds(p_old boolean) RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE v jsonb := '{}'::jsonb; w text; h boolean; first jsonb; c integer; u text; nxt jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM mg_members WHERE n = 5), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  FOREACH w IN ARRAY ARRAY['qzw', 'QZW', 'qzw1', 'qzw10', 'qzw0999', 'qzb0000a', 'qzn', 'Qzn 10', 'qzn 0', 'zw0', 'w00', 'qzb', 'bn 1', 'n 1',
                           'Bn 10', 'qz', 'q', 'qzw\_', 'qzv_', 'qz%1', '\%', 'qzm', 'zzzzqq', 'qzc0005', 'rehearsal', 'zn 1'] LOOP
    FOREACH h IN ARRAY ARRAY[false, true] LOOP
      BEGIN
        IF p_old THEN
          SELECT coalesce(jsonb_agg(jsonb_build_array(f.id, f.closeness, f.username)), '[]'::jsonb) INTO first FROM pg_temp.mg_old(w, h, NULL, NULL, 21) f;
        ELSE
          SELECT coalesce(jsonb_agg(jsonb_build_array(f.id, f.closeness, f.username)), '[]'::jsonb) INTO first FROM public.search_members(w, h, NULL, NULL, 21) f;
        END IF;
      EXCEPTION WHEN program_limit_exceeded THEN
        first := to_jsonb(SQLERRM);
      END;
      v := v || jsonb_build_object(w || '|' || h, first);
      IF jsonb_typeof(first) = 'array' AND jsonb_array_length(first) > 3 THEN
        c := (first -> 2 ->> 1)::int; u := first -> 2 ->> 2;
        BEGIN
          IF p_old THEN
            SELECT coalesce(jsonb_agg(jsonb_build_array(f.id, f.closeness)), '[]'::jsonb) INTO nxt FROM pg_temp.mg_old(w, h, c, u, 3) f;
          ELSE
            SELECT coalesce(jsonb_agg(jsonb_build_array(f.id, f.closeness)), '[]'::jsonb) INTO nxt FROM public.search_members(w, h, c, u, 3) f;
          END IF;
        EXCEPTION WHEN program_limit_exceeded THEN
          nxt := to_jsonb(SQLERRM);
        END;
        v := v || jsonb_build_object(w || '|' || h || '|next', nxt);
      END IF;
    END LOOP;
  END LOOP;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v;
END $f$;
CREATE TEMP TABLE mg_now ON COMMIT DROP AS SELECT pg_temp.mg_finds(false) AS r;
CREATE TEMP TABLE mg_was ON COMMIT DROP AS SELECT pg_temp.mg_finds(true) AS r;

SELECT pg_temp.rh_need('searches replayed', (SELECT count(*) FROM mg_now, jsonb_object_keys(r)), 70) AS done \gset rh_
SELECT pg_temp.rh_case('every search a list can answer answers as 20261122_29''s did, the whole page and the next', 'zn 1|false; zn 1|false|next',
  coalesce((SELECT string_agg(k, '; ' ORDER BY k) FROM mg_now n, mg_was w, jsonb_object_keys(n.r || w.r) k
             WHERE (n.r -> k) IS DISTINCT FROM (w.r -> k)), 'none')) AS done \gset rh_
SELECT pg_temp.rh_case('words whose holders lie past every list say so (TOO_WIDE), where the old search walked the handles to its page', 'TOO_WIDE|21',
  (SELECT (r ->> 'zn 1|false') FROM mg_now) || '|' || (SELECT jsonb_array_length(r -> 'zn 1|false') FROM mg_was)) AS done \gset rh_
SELECT pg_temp.rh_case('a name''s beginning held past a thousand: the first of them in handle order, at the third closeness', 'qzb0001|2|21',
  (SELECT (r -> 'bn 1|false' -> 0 ->> 2) || '|' || (r -> 'bn 1|false' -> 0 ->> 1) || '|' || jsonb_array_length(r -> 'bn 1|false') FROM mg_now)) AS done \gset rh_
SELECT pg_temp.rh_case('the search walks a name''s beginning and the words anywhere in the piece''s list, and says TOO_WIDE past it', 'true|true',
  (position('FROM private.member_grams g JOIN public.profiles p ON p.id = g.id' in pg_get_functiondef('public.search_members(text, boolean, integer, text, integer)'::regprocedure)) > 0)::text || '|'
    || (position('RAISE EXCEPTION ''TOO_WIDE'' USING ERRCODE = ''54000''' in pg_get_functiondef('public.search_members(text, boolean, integer, text, integer)'::regprocedure)) > 0)::text) AS done \gset rh_
SELECT pg_temp.rh_case('the planner settings the search turns off are as they were after it', 'on|on|on|on',
  current_setting('enable_bitmapscan') || '|' || current_setting('enable_sort') || '|' || current_setting('enable_seqscan') || '|' || current_setting('enable_indexscan')) AS done \gset rh_

-- A member renamed in the searching transaction itself, not yet settled: found as before.
UPDATE public.profiles SET username = 'qzw0001b' WHERE username = 'qzw0001';
CREATE FUNCTION pg_temp.mg_first(p_old boolean, p_words text) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE v text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM mg_members WHERE n = 5), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  IF p_old THEN SELECT string_agg(f.username, ',') INTO v FROM pg_temp.mg_old(p_words, false, NULL, NULL, 21) f;
  ELSE SELECT string_agg(f.username, ',') INTO v FROM public.search_members(p_words, false, NULL, NULL, 21) f; END IF;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN coalesce(v, 'none');
END $f$;
SELECT pg_temp.rh_case('a member renamed in the searching transaction, before it settles, is found as before', 'qzw0001b|qzw0001b',
  pg_temp.mg_first(false, 'qzw0001b') || '|' || pg_temp.mg_first(true, 'qzw0001b')) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
