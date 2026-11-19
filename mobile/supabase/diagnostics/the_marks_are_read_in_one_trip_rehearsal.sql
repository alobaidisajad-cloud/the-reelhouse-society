-- ════════════════════════════════════════════════════════════════════════════
-- the_marks_are_read_in_one_trip_rehearsal.sql — 20261119_18. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs the_marks_are_read_in_one_trip_rehearsal.sql --with-train
--
-- The train applies 20261119_18 here (with_train), 20261119_00 to 20261119_17 already applied; a sealed copy already holds it.
-- Then the house and members in good standing, acting as themselves, find what it fixes holding (review round 13).
-- Every row here is undone with the transaction. Read each NOTICE as  case|expected|got ; the last line
-- is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

-- As the house: claims cleared, so no member's gate judges the setup.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

CREATE TEMP TABLE rehearsal_members ON COMMIT DROP AS
  SELECT u.id, row_number() OVER (ORDER BY u.created_at) AS n
    FROM auth.users u JOIN public.profiles p ON p.id = u.id
   WHERE NOT coalesce(p.is_banned, false) AND (p.suspended_until IS NULL OR p.suspended_until <= now())
   ORDER BY u.created_at LIMIT 4;
SELECT pg_temp.rh_need('members in good standing', (SELECT count(*) FROM rehearsal_members), 4) AS done \gset rh_
GRANT SELECT ON rehearsal_members TO authenticated;

-- The piece's own tables, made before the train, empty: the piece fills them as it runs.
CREATE TEMP TABLE hd2_read (n bigint, ledger json, own_logs text, own_saved text) ON COMMIT DROP;
GRANT ALL ON hd2_read TO authenticated;
CREATE TEMP TABLE hd2_visitor (got text) ON COMMIT DROP;
GRANT ALL ON hd2_visitor TO anon;

-- The train applies it here first (with_train), on production as the cars before it left it; a sealed
-- copy already holds every pending migration.
-- 20261119_18 is applied on production (the train of 2026-11-19); this shows it still holds there.

-- ── H-D2 ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.interaction_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interaction_churn WHERE user_id IN (SELECT id FROM rehearsal_members);
-- ── H-D2 rehearsal · a member's marks in one trip, as their own read found them (review round 13) ──
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train (pg_temp.rh_case,
-- rolled back with the rest), with its rehearsal_members (n = 1..4). 1 logs two films the house has
-- never seen and keeps a third; 2 logs one of them too. Each, as themselves, asks get_marks_ledger:
-- it holds every log and every kept film their own read of the tables finds (the read the phone made
-- page by page), each column in the same order, and nothing of the other's. A visitor is refused.

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.user_blocks
 WHERE blocker_id IN (SELECT id FROM rehearsal_members) AND blocked_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.logs WHERE film_id IN (990131, 990132) AND user_id IN (SELECT id FROM rehearsal_members WHERE n IN (1, 2));
DELETE FROM public.watchlists WHERE film_id = 990133 AND user_id = (SELECT id FROM rehearsal_members WHERE n = 1);
INSERT INTO public.logs (user_id, film_id, film_title, watched_date, rating, status, year)
VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), 990131, 'The H-D2 Picture', '2026-11-01', 4, 'watched', '1931'),
       ((SELECT id FROM rehearsal_members WHERE n = 1), 990132, 'The H-D2 Sequel', '2026-11-02', NULL, 'abandoned', NULL),
       ((SELECT id FROM rehearsal_members WHERE n = 2), 990131, 'The H-D2 Picture', '2026-11-03', 2, 'watched', '1931');
INSERT INTO public.watchlists (user_id, film_id, film_title)
VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), 990133, 'The H-D2 Feature');


-- A member asks, as themselves; and reads their own tables as the phone's pages did, through the rules.
CREATE FUNCTION pg_temp.hd2_ask(p_member bigint) RETURNS void LANGUAGE plpgsql AS $$
DECLARE me uuid := (SELECT id FROM rehearsal_members WHERE n = p_member);
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', me, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  INSERT INTO hd2_read
  SELECT p_member, public.get_marks_ledger(),
         (SELECT string_agg(l.id::text || '/' || l.film_id || '/' || coalesce(l.rating::text, '-') || '/' || l.status || '/' || l.watched_date, ',' ORDER BY l.id)
            FROM public.logs l WHERE l.user_id = me),
         (SELECT string_agg(w.film_id::text, ',' ORDER BY w.film_id) FROM public.watchlists w WHERE w.user_id = me);
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
END $$;
SELECT pg_temp.hd2_ask(1) AS done \gset rh_
SELECT pg_temp.hd2_ask(2) AS done \gset rh_

-- The ledger's columns laid back into rows, as the phone lays them.
CREATE FUNCTION pg_temp.hd2_rows(p_member bigint) RETURNS text LANGUAGE sql AS $$
  SELECT string_agg(i.id || '/' || f.film_id || '/' || coalesce(r.rating, '-') || '/' || s.status || '/' || d.watched_date, ',' ORDER BY i.id)
    FROM hd2_read h,
         json_array_elements_text(h.ledger -> 'logs' -> 'id') WITH ORDINALITY i(id, k)
    JOIN json_array_elements_text(h.ledger -> 'logs' -> 'film_id') WITH ORDINALITY f(film_id, k) USING (k)
    JOIN json_array_elements_text(h.ledger -> 'logs' -> 'rating') WITH ORDINALITY r(rating, k) USING (k)
    JOIN json_array_elements_text(h.ledger -> 'logs' -> 'status') WITH ORDINALITY s(status, k) USING (k)
    JOIN json_array_elements_text(h.ledger -> 'logs' -> 'watched_date') WITH ORDINALITY d(watched_date, k) USING (k)
   WHERE h.n = p_member;
$$;

SELECT pg_temp.rh_case('member 1''s ledger holds every log their own read finds, each column in one order',
  (SELECT own_logs FROM hd2_read WHERE n = 1), pg_temp.hd2_rows(1)) AS done \gset rh_
SELECT pg_temp.rh_case('and the films they keep',
  (SELECT own_saved FROM hd2_read WHERE n = 1),
  (SELECT string_agg(v, ',' ORDER BY v::int) FROM hd2_read, json_array_elements_text(ledger -> 'saved') v WHERE n = 1)) AS done \gset rh_
SELECT pg_temp.rh_case('member 1''s holds both their films, and member 2''s log of the same film is not in it', '990131,990132',
  (SELECT string_agg(f, ',' ORDER BY f) FROM hd2_read, json_array_elements_text(ledger -> 'logs' -> 'film_id') f
    WHERE n = 1 AND f IN ('990131', '990132'))) AS done \gset rh_
SELECT pg_temp.rh_case('member 2''s ledger is their own read too',
  (SELECT own_logs FROM hd2_read WHERE n = 2), pg_temp.hd2_rows(2)) AS done \gset rh_
SELECT pg_temp.rh_case('every column is as long as the ids', 'true',
  (SELECT bool_and(json_array_length(ledger -> 'logs' -> c) = json_array_length(ledger -> 'logs' -> 'id'))::text
     FROM hd2_read, unnest(ARRAY['film_id', 'film_title', 'poster_path', 'year', 'status', 'rating', 'view_count', 'watched_date']) c)) AS done \gset rh_

-- A visitor has no ledger: the function is not theirs to call.
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  PERFORM set_config('role', 'anon', true);
  BEGIN
    PERFORM public.get_marks_ledger();
    INSERT INTO hd2_visitor VALUES ('answered');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO hd2_visitor VALUES ('refused');
  END;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
END $$;
SELECT pg_temp.rh_case('a visitor is refused', 'refused', (SELECT got FROM hd2_visitor)) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
