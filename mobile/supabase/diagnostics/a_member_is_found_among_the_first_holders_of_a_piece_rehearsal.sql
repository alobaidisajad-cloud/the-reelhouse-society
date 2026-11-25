-- ════════════════════════════════════════════════════════════════════════════
-- a_member_is_found_among_the_first_holders_of_a_piece_rehearsal.sql — 20261122_62. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_member_is_found_among_the_first_holders_of_a_piece_rehearsal.sql
--
-- 20261122_62 is applied on production (the train of 2026-11-24); this shows it still holds there, and on every sealed copy.
-- It plants 15 members whose handles begin "qzw" and whose names begin "Qzn ", and 15 more
-- whose handles begin "qzb" and whose names begin "Bn 1", a few handles and names around them and the
-- member who searches, all with ids that sort after every member of the house; and asks 20261122_29's
-- search_members, held here as it was, for each of the words searched (none of which any other member
-- holds), a page of four and the next two.
-- Then the car's lists are emptied and the job's place set just before the planted ids (the
-- house before them read, as far as these words go), and the lists' cap made ten (a thousand in the
-- house), so each run of 15 is held past it, all rolled back: what runs after that reads the planted
-- alone, and holds the members' writes no longer at any size of the house.
-- The planted are passed over by their own settling, and the search reads as before, until the job has
-- read them, ten at a time, and marks the lists complete. Then each piece the planted ever held
-- lists exactly its holders up to its last listed handle (every holder when it lists them all), counts
-- them all, and lists at most ten; and as a member searching, search_members answers every word as
-- 20261122_29's did (the page, with each closeness, and the next after a cursor), but words whose holders
-- lie past every list it could read, which say TOO_WIDE; a name's beginning held past the cap is
-- walked in its piece's list. Members join, are renamed and leave, past a list's last handle and before
-- it, until a piece lists every holder again and then too many once more. With the job's place set back
-- among them, members it has not reached are passed over by their commit and read by it as they stand,
-- and one it has passed is settled by its commit. No member reads the lists or runs the job.
-- Every row here is undone with the transaction. Read each NOTICE as  case|expected|got ; the last line
-- is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql
RESET ROLE;

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
-- ── the planted members ──
-- Their ids sort after every member of the house, so the job's place can be set just before them.
SELECT pg_temp.rh_need('no member of the house whose id sorts among the planted (1 = none)',
  (SELECT CASE WHEN count(*) = 0 THEN 1 ELSE 0 END FROM public.profiles WHERE id >= 'ffffffff-0000-4000-8000-000000000000'), 1) AS done \gset rh_
-- 30 members (the house makes each profile from the handle asked): qzw01.. named "Qzn 01..", and qzb01..
-- named "Bn 101.."; four handles and names around them; and the member who searches.
INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at, email_confirmed_at)
SELECT ('ffffffff-0000-4000-8000-00' || f.code || lpad(g::text, 8, '0'))::uuid,
       'authenticated', 'authenticated', f.lead || lpad(g::text, 2, '0') || '@rehearsal.test',
       jsonb_build_object('username', f.lead || lpad(g::text, 2, '0')), '{"provider":"email"}'::jsonb, now(), now(), now()
  FROM generate_series(1, 15) g, (VALUES ('62', 'qzw'), ('63', 'qzb')) f(code, lead);
INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at, email_confirmed_at)
SELECT ('ffffffff-0000-4000-8000-00' || e.code || lpad(e.n::text, 8, '0'))::uuid, 'authenticated', 'authenticated', e.handle || '@rehearsal.test',
       jsonb_build_object('username', e.handle), '{"provider":"email"}'::jsonb, now(), now(), now()
  FROM (VALUES ('66', 1, 'rh_qzw1'), ('66', 2, 'rhqzw2x'), ('66', 3, 'qzv_rh'), ('66', 4, 'qzx1_rh'), ('67', 1, 'rhqzseek')) e(code, n, handle);
UPDATE public.profiles SET display_name = CASE WHEN username LIKE 'qzw%' THEN 'Qzn ' ELSE 'Bn 1' END || substr(username, 4),
       is_social_private = false
 WHERE username ~ '^qz[wb][0-9]{2}$';
UPDATE public.profiles SET display_name = CASE username WHEN 'rh_qzw1' THEN 'Rehearsal Qzn' WHEN 'rhqzw2x' THEN 'Qzm Rehearsal' WHEN 'qzv_rh' THEN 'Rehearsal 3' WHEN 'qzx1_rh' THEN 'Rehearsal 4' ELSE 'Rehearsal 5' END
 WHERE id >= 'ffffffff-0000-4000-8000-006600000000';
SELECT pg_temp.rh_need('35 members planted', (SELECT count(*) FROM public.profiles WHERE id >= 'ffffffff-0000-4000-8000-000000000000'), 35) AS done \gset rh_

-- The words searched: none is held by any member but the planted, so the planted alone answer them.
CREATE TEMP TABLE mg_words (n integer, w text) ON COMMIT DROP;
INSERT INTO mg_words VALUES (1, 'qzw'), (2, 'QZW'), (3, 'qzw1'), (4, 'qzw0'), (5, 'qzw09'), (6, 'qzb00a'), (7, 'qzn'),
  (8, 'Qzn 1'), (9, 'qzn 0'), (10, 'zw0'), (11, 'qzb'), (12, 'bn 1'), (13, 'Bn 10'), (14, 'qzw\_'), (15, 'qzv_'), (16, 'qzm'),
  (17, 'zzzzqq'), (18, 'qzc05'), (19, 'zn 1'), (20, 'qzx1');
CREATE FUNCTION pg_temp.mg_others(p_words text) RETURNS bigint LANGUAGE plpgsql AS $f$
DECLARE v bigint;
BEGIN
  -- Each word as its own read, so the trigram indexes find who else holds it.
  EXECUTE format('SELECT count(*) FROM public.profiles p WHERE p.id < %L AND (p.username ILIKE %L ESCAPE %L OR p.display_name ILIKE %L ESCAPE %L)',
                 'ffffffff-0000-4000-8000-000000000000', '%' || p_words || '%', '\', '%' || p_words || '%', '\') INTO v;
  RETURN v;
END $f$;
SELECT pg_temp.rh_need('no member of the house holding a word searched (1 = none)',
  (SELECT CASE WHEN sum((SELECT pg_temp.mg_others(w.w))) = 0 THEN 1 ELSE 0 END FROM mg_words w), 1) AS done \gset rh_

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

-- What the member who searches finds for one word by either search: the page of four in order, with each
-- closeness; and the next two after the first three. A search that says TOO_WIDE is written as such.
CREATE FUNCTION pg_temp.mg_find(p_old boolean, p_words text, p_handles boolean) RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE first jsonb; c integer; u text; nxt jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', 'ffffffff-0000-4000-8000-006700000001', 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  BEGIN
    IF p_old THEN
      SELECT coalesce(jsonb_agg(jsonb_build_array(f.id, f.closeness, f.username)), '[]'::jsonb) INTO first FROM pg_temp.mg_old(p_words, p_handles, NULL, NULL, 4) f;
    ELSE
      SELECT coalesce(jsonb_agg(jsonb_build_array(f.id, f.closeness, f.username)), '[]'::jsonb) INTO first FROM public.search_members(p_words, p_handles, NULL, NULL, 4) f;
    END IF;
  EXCEPTION WHEN program_limit_exceeded THEN
    first := to_jsonb(SQLERRM);
  END;
  IF jsonb_typeof(first) = 'array' AND jsonb_array_length(first) > 3 THEN
    c := (first -> 2 ->> 1)::int; u := first -> 2 ->> 2;
    BEGIN
      IF p_old THEN
        SELECT coalesce(jsonb_agg(jsonb_build_array(f.id, f.closeness)), '[]'::jsonb) INTO nxt FROM pg_temp.mg_old(p_words, p_handles, c, u, 2) f;
      ELSE
        SELECT coalesce(jsonb_agg(jsonb_build_array(f.id, f.closeness)), '[]'::jsonb) INTO nxt FROM public.search_members(p_words, p_handles, c, u, 2) f;
      END IF;
    EXCEPTION WHEN program_limit_exceeded THEN
      nxt := to_jsonb(SQLERRM);
    END;
  END IF;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN jsonb_build_object('first', first, 'next', nxt);
END $f$;
-- The old answers, a few words a statement (the old search walks the handles for some of them).
CREATE TEMP TABLE mg_was (w text, h boolean, r jsonb) ON COMMIT DROP;
INSERT INTO mg_was SELECT w.w, h.h, pg_temp.mg_find(true, w.w, h.h) FROM mg_words w, (VALUES (false), (true)) h(h) WHERE w.n BETWEEN 1 AND 5;
INSERT INTO mg_was SELECT w.w, h.h, pg_temp.mg_find(true, w.w, h.h) FROM mg_words w, (VALUES (false), (true)) h(h) WHERE w.n BETWEEN 6 AND 10;
INSERT INTO mg_was SELECT w.w, h.h, pg_temp.mg_find(true, w.w, h.h) FROM mg_words w, (VALUES (false), (true)) h(h) WHERE w.n BETWEEN 11 AND 15;
INSERT INTO mg_was SELECT w.w, h.h, pg_temp.mg_find(true, w.w, h.h) FROM mg_words w, (VALUES (false), (true)) h(h) WHERE w.n BETWEEN 16 AND 20;

RESET ROLE;

-- ── the job's place, just before the planted ──
-- Its row first (a run of the job meanwhile gives way at once), then the lists emptied: the planted are
-- the members still to be read, and each list holds ten at most. The row the car laid stands wherever
-- the car is (production, and a copy built from the snapshot, which carries it).
SELECT pg_temp.rh_need('the fill''s one row, as the car laid it', (SELECT count(*) FROM private.member_grams_filled), 1) AS done \gset rh_
UPDATE private.member_grams_filled SET after = 'ffffffff-0000-4000-8000-000000000000', members = 0, complete = false, ended = NULL, cap = 10;
DELETE FROM private.member_grams;
DELETE FROM private.member_gram_heads;
-- Settled now, as the commit would settle them (the planted were queued as they joined).
SET CONSTRAINTS a_members_pieces_are_settled IMMEDIATE;
SET CONSTRAINTS a_members_pieces_are_settled DEFERRED;
SELECT pg_temp.rh_case('the planted, past the job''s place, are passed over by their own settling: nothing listed, nothing left waiting', '0|0',
  (SELECT count(*)::text FROM private.member_grams) || '|' || (SELECT count(*) FROM private.member_grams_waiting WHERE txid = txid_current())::text) AS done \gset rh_

-- Every piece the planted members hold, and will have held.
CREATE TEMP TABLE mg_pieces ON COMMIT DROP AS
  SELECT DISTINCT g FROM public.profiles p, unnest(private.member_grams_of(p.username, p.display_name)) g
   WHERE p.id >= 'ffffffff-0000-4000-8000-000000000000'
  UNION SELECT unnest(private.member_grams_of('qzc05', 'Bn 105')) UNION SELECT unnest(private.member_grams_of('qzd14', 'Bn 114'))
  UNION SELECT unnest(private.member_grams_of('qzb00a', NULL)) UNION SELECT unnest(private.member_grams_of('qzb21', NULL))
  UNION SELECT unnest(private.member_grams_of('qzb22', NULL)) UNION SELECT unnest(private.member_grams_of('qzw02t', 'Qzn 02'))
  UNION SELECT unnest(private.member_grams_of('qzt0001', NULL)) UNION SELECT unnest(private.member_grams_of('qzt0002', NULL))
  UNION SELECT unnest(private.member_grams_of('qzt0003', NULL)) UNION SELECT unnest(private.member_grams_of('qzt0003r', NULL));

-- What each piece should hold, read again from the planted (the members the lists hold here): its
-- holders, and whether its list is exact up to its last listed handle (every holder, when it lists them
-- all) and never past its cap. Any row of another member in a list is wrong too.
CREATE FUNCTION pg_temp.mg_lists_wrong() RETURNS text LANGUAGE sql AS $f$
  WITH held AS (
    SELECT g.g AS gram, p.username, p.id
      FROM public.profiles p CROSS JOIN LATERAL unnest(private.member_grams_of(p.username, p.display_name)) g(g)
     WHERE p.id >= 'ffffffff-0000-4000-8000-000000000000' AND g.g IN (SELECT g FROM mg_pieces)
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
     WHERE coalesce(h.holders, 0) <> c.holders OR coalesce(h.listed, 0) <> coalesce(l.n, 0) OR coalesce(h.listed, 0) > (SELECT f.cap FROM private.member_grams_filled f)
        OR (h.upto IS NOT NULL AND h.upto IS DISTINCT FROM l.last)
    UNION SELECT e.gram FROM (SELECT * FROM expected EXCEPT SELECT * FROM actual) e
    UNION SELECT x.gram FROM (SELECT * FROM actual EXCEPT SELECT * FROM expected) x
  )
  SELECT coalesce(string_agg(gram, ' ' ORDER BY gram), 'none') FROM wrong
$f$;
CREATE FUNCTION pg_temp.mg_head(p_gram text) RETURNS text LANGUAGE sql AS $f$
  SELECT coalesce((SELECT h.holders || '|' || h.listed || '|' || coalesce(h.upto, 'every') FROM private.member_gram_heads h WHERE h.gram = p_gram), 'none')
$f$;
-- The job run until it says the lists are complete (at most ten runs), each run's word kept.
CREATE FUNCTION pg_temp.mg_job(p_members integer) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE v text; said text[] := '{}';
BEGIN
  FOR k IN 1 .. 10 LOOP
    v := private.member_grams_fill(p_members);
    said := said || v;
    EXIT WHEN v = 'complete';
  END LOOP;
  RETURN array_to_string(said, '|');
END $f$;
-- The first of the planted in handle order found by a search, by either search.
CREATE FUNCTION pg_temp.mg_first(p_old boolean, p_words text) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE v text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', 'ffffffff-0000-4000-8000-006700000001', 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  IF p_old THEN SELECT string_agg(f.username, ',') INTO v FROM pg_temp.mg_old(p_words, false, NULL, NULL, 21) f;
  ELSE SELECT string_agg(f.username, ',') INTO v FROM public.search_members(p_words, false, NULL, NULL, 21) f; END IF;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN coalesce(v, 'none');
END $f$;

-- ── while the job reads them ──
SELECT pg_temp.rh_case('until the job has read every member, the search reads as 20261122_29''s did', 'true|true',
  (pg_temp.mg_find(false, 'qzw09', false) = (SELECT r FROM mg_was WHERE w = 'qzw09' AND NOT h))::text || '|'
    || (pg_temp.mg_find(false, 'qzw1', false) = (SELECT r FROM mg_was WHERE w = 'qzw1' AND NOT h))::text) AS done \gset rh_
SELECT pg_temp.rh_case('the job reads ten at a time, each run where the last ended, and the run after the last says complete',
  'listed 10|listed 10|listed 10|listed 5|complete', pg_temp.mg_job(10)) AS done \gset rh_
SELECT pg_temp.rh_case('the lists marked complete, every planted member read', 'true|35',
  (SELECT complete::text || '|' || members FROM private.member_grams_filled)) AS done \gset rh_
SELECT pg_temp.rh_case('read by the job: every piece lists its holders up to its last, and counts them all', 'none', pg_temp.mg_lists_wrong()) AS done \gset rh_
SELECT pg_temp.rh_case('a piece held by 15 lists the first ten in handle order, and counts all', '15|10|qzb10', pg_temp.mg_head('aqzb')) AS done \gset rh_
SELECT pg_temp.rh_case('a handle''s piece, for a search of handles alone, is kept as well', '15|10|qzb10', pg_temp.mg_head('hqzb')) AS done \gset rh_

-- ── the search, by the lists ──
CREATE TEMP TABLE mg_now (w text, h boolean, r jsonb) ON COMMIT DROP;
INSERT INTO mg_now SELECT w.w, h.h, pg_temp.mg_find(false, w.w, h.h) FROM mg_words w, (VALUES (false), (true)) h(h);
SELECT pg_temp.rh_need('searches replayed', (SELECT count(*) FROM mg_now n JOIN mg_was w USING (w, h)), 40) AS done \gset rh_
SELECT pg_temp.rh_case('every search a list can answer answers as 20261122_29''s did, the whole page and the next', 'zn 1|false',
  coalesce((SELECT string_agg(n.w || '|' || n.h, '; ' ORDER BY n.w, n.h) FROM mg_now n JOIN mg_was w USING (w, h) WHERE n.r IS DISTINCT FROM w.r), 'none')) AS done \gset rh_
SELECT pg_temp.rh_case('words whose holders lie past every list say so (TOO_WIDE), where the old search walked the handles to its page', 'TOO_WIDE|4',
  (SELECT r ->> 'first' FROM mg_now WHERE w = 'zn 1' AND NOT h) || '|' || (SELECT jsonb_array_length(r -> 'first') FROM mg_was WHERE w = 'zn 1' AND NOT h)) AS done \gset rh_
SELECT pg_temp.rh_case('a name''s beginning held past the cap: the first of them in handle order, at the third closeness', 'qzb01|2|4',
  (SELECT (r -> 'first' -> 0 ->> 2) || '|' || (r -> 'first' -> 0 ->> 1) || '|' || jsonb_array_length(r -> 'first') FROM mg_now WHERE w = 'bn 1' AND NOT h)) AS done \gset rh_
SELECT pg_temp.rh_case('the search walks a name''s beginning and the words anywhere in the piece''s list, and says TOO_WIDE past it', 'true|true',
  (position('FROM private.member_grams g JOIN public.profiles p ON p.id = g.id' in pg_get_functiondef('public.search_members(text, boolean, integer, text, integer)'::regprocedure)) > 0)::text || '|'
    || (position('RAISE EXCEPTION ''TOO_WIDE'' USING ERRCODE = ''54000''' in pg_get_functiondef('public.search_members(text, boolean, integer, text, integer)'::regprocedure)) > 0)::text) AS done \gset rh_
SELECT pg_temp.rh_case('the planner settings the search turns off are as they were after it', 'on|on|on|on',
  current_setting('enable_bitmapscan') || '|' || current_setting('enable_sort') || '|' || current_setting('enable_seqscan') || '|' || current_setting('enable_indexscan')) AS done \gset rh_

-- ── members join, are renamed and leave ──
-- Renamed out of a list, and out of the piece altogether; one leaves; one joins before the list's last.
UPDATE public.profiles SET username = 'qzc05' WHERE username = 'qzb05';
DELETE FROM public.profiles WHERE username = 'qzb08';
INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at, email_confirmed_at)
VALUES ('ffffffff-0000-4000-8000-006400000001', 'authenticated', 'authenticated', 'qzb00a@rehearsal.test',
        '{"username": "qzb00a"}'::jsonb, '{"provider":"email"}'::jsonb, now(), now(), now());
-- Renamed past the list's last: counted off, the list as it was.
UPDATE public.profiles SET username = 'qzd14' WHERE username = 'qzb14';
SELECT pg_temp.rh_case('the written wait for their transaction to settle: the lists as they were', '15|10|qzb10', pg_temp.mg_head('aqzb')) AS done \gset rh_
-- Settled now, as the commit would settle them.
SET CONSTRAINTS a_members_pieces_are_settled IMMEDIATE;
SET CONSTRAINTS a_members_pieces_are_settled DEFERRED;
SELECT pg_temp.rh_case('renamed, left and joined: every piece lists its holders up to its last, and counts them all', 'none', pg_temp.mg_lists_wrong()) AS done \gset rh_
SELECT pg_temp.rh_case('two went from the list and one came: nine listed, 13 counted, the last as it was', '13|9|qzb10', pg_temp.mg_head('aqzb')) AS done \gset rh_

-- Every holder past the list's last leaves: the piece lists every holder again.
DELETE FROM public.profiles WHERE username ~ '^qzb1[0-9]$' AND username > 'qzb10';
-- Settled now, as the commit would settle them.
SET CONSTRAINTS a_members_pieces_are_settled IMMEDIATE;
SET CONSTRAINTS a_members_pieces_are_settled DEFERRED;
SELECT pg_temp.rh_case('every holder past the last gone: the piece lists every holder', '9|9|every', pg_temp.mg_head('aqzb')) AS done \gset rh_
-- Two more join: one past the cap, and the last listed goes.
INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at, email_confirmed_at)
SELECT ('ffffffff-0000-4000-8000-0065' || lpad(g::text, 8, '0'))::uuid, 'authenticated', 'authenticated', 'qzb2' || g || '@rehearsal.test',
       jsonb_build_object('username', 'qzb2' || g), '{"provider":"email"}'::jsonb, now(), now(), now()
  FROM generate_series(1, 2) g;
-- Settled now, as the commit would settle them.
SET CONSTRAINTS a_members_pieces_are_settled IMMEDIATE;
SET CONSTRAINTS a_members_pieces_are_settled DEFERRED;
SELECT pg_temp.rh_case('eleven: the last listed goes and the list ends before it', '11|10|qzb21', pg_temp.mg_head('aqzb')) AS done \gset rh_
SELECT pg_temp.rh_case('after every write: every piece lists its holders up to its last, and counts them all', 'none', pg_temp.mg_lists_wrong()) AS done \gset rh_

-- ── the job's place set back, before three who join ──
-- Three join past it, and one of them is renamed: their commit passes them over. One it has passed is
-- renamed: its commit settles it.
UPDATE private.member_grams_filled SET complete = false, ended = NULL, after = 'ffffffff-0000-4000-8000-006800000000';
INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at, email_confirmed_at)
SELECT ('ffffffff-0000-4000-8000-0068' || lpad(g::text, 8, '0'))::uuid, 'authenticated', 'authenticated', 'qzt' || lpad(g::text, 4, '0') || '@rehearsal.test',
       jsonb_build_object('username', 'qzt' || lpad(g::text, 4, '0')), '{"provider":"email"}'::jsonb, now(), now(), now()
  FROM generate_series(1, 3) g;
UPDATE public.profiles SET username = 'qzt0003r' WHERE username = 'qzt0003';
UPDATE public.profiles SET username = 'qzw02t' WHERE username = 'qzw02';
-- Settled now, as the commit would settle them.
SET CONSTRAINTS a_members_pieces_are_settled IMMEDIATE;
SET CONSTRAINTS a_members_pieces_are_settled DEFERRED;
SELECT pg_temp.rh_case('past the job''s place: the joined, and renamed, wait for it; the one it passed is settled at once', 'none|1|0',
  pg_temp.mg_head('aqzt') || '|' || (SELECT count(*) FROM private.member_grams WHERE gram = 'aqzw' AND username = 'qzw02t')::text || '|'
    || (SELECT count(*) FROM private.member_grams WHERE gram = 'aqzw' AND username = 'qzw02')::text) AS done \gset rh_
SELECT pg_temp.rh_case('until the job has read them, they are found as before', 'qzt0001|qzt0001',
  pg_temp.mg_first(false, 'qzt0001') || '|' || pg_temp.mg_first(true, 'qzt0001')) AS done \gset rh_
SELECT pg_temp.rh_case('the job reads them as they stand, from where it was', 'listed 3|complete', pg_temp.mg_job(10)) AS done \gset rh_
SELECT pg_temp.rh_case('read again by the job: every piece lists its holders up to its last, and counts them all', 'none', pg_temp.mg_lists_wrong()) AS done \gset rh_

-- A member renamed in the searching transaction itself, not yet settled: found as before.
UPDATE public.profiles SET username = 'qzw01b' WHERE username = 'qzw01';
SELECT pg_temp.rh_case('a member renamed in the searching transaction, before it settles, is found as before', 'qzw01b|qzw01b',
  pg_temp.mg_first(false, 'qzw01b') || '|' || pg_temp.mg_first(true, 'qzw01b')) AS done \gset rh_

SELECT pg_temp.rh_case('no member reads the lists or runs the job', 'false|false|false|false|false|false',
  has_table_privilege('authenticated', 'private.member_grams', 'SELECT')::text || '|' || has_table_privilege('anon', 'private.member_grams', 'SELECT')::text || '|'
  || has_table_privilege('authenticated', 'private.member_gram_heads', 'SELECT')::text || '|' || has_table_privilege('authenticated', 'private.member_grams_filled', 'SELECT')::text || '|'
  || has_function_privilege('authenticated', 'private.member_grams_apply(private.member_grams[], private.member_grams[])', 'EXECUTE')::text || '|'
  || has_function_privilege('authenticated', 'private.member_grams_fill(integer)', 'EXECUTE')::text) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
