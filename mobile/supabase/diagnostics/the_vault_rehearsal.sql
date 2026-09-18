-- ════════════════════════════════════════════════════════════════════════════
-- THE VAULT — a rehearsal against production, always rolled back
-- ════════════════════════════════════════════════════════════════════════════
-- Runs every rule a private note lives by as REAL members on REAL rows, inside
-- one transaction that is rolled back. Prints PASS/FAIL per case, then proves
-- nothing changed.
--
--   psql "$SUPABASE_DB_URL" -X -q -f supabase/diagnostics/the_vault_rehearsal.sql
--   psql "$SUPABASE_DB_URL" -X -q -v migration=<file.sql> -f supabase/diagnostics/the_vault_rehearsal.sql
--
-- The second form applies a migration INSIDE the transaction first, so a fix
-- can be proven on production before anybody runs it. The migration must hold
-- NO BEGIN/COMMIT/ROLLBACK — one would close this transaction and write for
-- real (it has happened twice; see memory "never nest transaction control").
--
-- Members used: morpho (Auteur, the owner), malal (free — raised to Archivist
-- inside the transaction, so the attacks are made with full rank), malal1
-- (free, playing a lapsed member).
-- ════════════════════════════════════════════════════════════════════════════
\pset pager off
\set ON_ERROR_STOP on
BEGIN;

\if :{?migration}
\echo == applying :migration inside the transaction
\i :migration
\endif

CREATE TEMP TABLE r (n serial, verdict text, what text) ON COMMIT DROP;
GRANT ALL ON r TO authenticated; GRANT USAGE ON SEQUENCE r_n_seq TO authenticated;
CREATE TEMP TABLE ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;
GRANT ALL ON ctx TO authenticated;

INSERT INTO ctx VALUES
 ('victim',  '6fecf15b-0623-43f1-b240-098ad19df754'),
 ('stranger','fc717f12-c82e-41b4-b608-5cd39e4ac18d'),
 ('lapsed',  '629b60b4-5c56-4b88-a708-afc50ed82637'),
 ('before_notes', (SELECT count(*)::text FROM log_private_notes)),
 ('before_logs',  (SELECT count(*)::text FROM logs));
INSERT INTO ctx SELECT 'L' || (row_number() OVER (ORDER BY id)), id::text FROM logs
 WHERE user_id = '6fecf15b-0623-43f1-b240-098ad19df754' AND jsonb_array_length(viewing_history) > 0
 ORDER BY id LIMIT 4;
INSERT INTO ctx SELECT 'LL', id::text FROM logs WHERE user_id = '629b60b4-5c56-4b88-a708-afc50ed82637' ORDER BY id LIMIT 1;
INSERT INTO ctx SELECT 'SL', id::text FROM logs WHERE user_id = 'fc717f12-c82e-41b4-b608-5cd39e4ac18d' ORDER BY id LIMIT 1;
-- two films the stranger has not logged, so their new logs are legal
INSERT INTO ctx SELECT 'film' || (row_number() OVER (ORDER BY film_id)), film_id::text FROM (
  SELECT DISTINCT film_id FROM logs WHERE film_id IS NOT NULL
     AND film_id NOT IN (SELECT film_id FROM logs WHERE user_id = 'fc717f12-c82e-41b4-b608-5cd39e4ac18d' AND film_id IS NOT NULL)
   ORDER BY film_id LIMIT 2) f;
UPDATE profiles SET tier = 'archivist' WHERE id = 'fc717f12-c82e-41b4-b608-5cd39e4ac18d';
-- a note the lapsed member wrote while they were paid
INSERT INTO log_private_notes (log_id, viewing_id, user_id, notes)
  SELECT l.id, l.viewing_id, l.user_id, 'written while paid' FROM logs l WHERE l.id = (SELECT v::uuid FROM ctx WHERE k='LL');

CREATE FUNCTION pg_temp.as_member(uid uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', uid::text, true);
$$;
CREATE FUNCTION pg_temp.c(k text) RETURNS uuid LANGUAGE sql AS $$ SELECT v::uuid FROM ctx WHERE ctx.k = $1 $$;
CREATE FUNCTION pg_temp.ok(cond boolean, what text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO r (verdict, what) VALUES (CASE WHEN cond THEN 'PASS' ELSE 'FAIL' END, what);
$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated;

SET LOCAL ROLE authenticated;

-- ── the owner ─────────────────────────────────────────────────────────
DO $$ BEGIN PERFORM pg_temp.as_member(pg_temp.c('victim')); END $$;
DO $$ DECLARE vid uuid; BEGIN
  SELECT viewing_id INTO vid FROM logs WHERE id = pg_temp.c('L1');
  INSERT INTO ctx VALUES ('V1', vid::text);
  PERFORM viewing_note_set(pg_temp.c('L1'), vid, '  first viewing note  ');
  PERFORM pg_temp.ok((SELECT notes FROM log_private_notes WHERE viewing_id = vid) = 'first viewing note', '01 the owner writes a note on the current viewing (trimmed)');
END $$;

DO $$ BEGIN
  PERFORM log_viewing_add(pg_temp.c('L1'), 'aaaaaaaa-0000-4000-8000-000000000001', '{"rating": 4, "review": "second look"}');
  PERFORM log_viewing_add(pg_temp.c('L1'), 'aaaaaaaa-0000-4000-8000-000000000001', '{"rating": 1}');
  PERFORM pg_temp.ok((SELECT viewing_id FROM logs WHERE id = pg_temp.c('L1')) = 'aaaaaaaa-0000-4000-8000-000000000001', '02 a rewatch makes the new viewing current');
  PERFORM pg_temp.ok((SELECT viewing_history->0->>'viewingId' FROM logs WHERE id = pg_temp.c('L1')) = pg_temp.c('V1')::text, '03 the old viewing goes into history with its identity');
  PERFORM pg_temp.ok((SELECT rating FROM logs WHERE id = pg_temp.c('L1')) = 4, '04 a retried rewatch does nothing twice');
  PERFORM pg_temp.ok((SELECT NOT (viewing_history::text ILIKE '%first viewing note%') FROM logs WHERE id = pg_temp.c('L1')), '05 the note is never copied into the public history');
  PERFORM pg_temp.ok((SELECT view_count = jsonb_array_length(viewing_history) + 1 FROM logs WHERE id = pg_temp.c('L1')), '06 the count follows the history');
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM log_private_notes WHERE viewing_id = pg_temp.c('V1')), '07 the old viewing keeps its note');
  PERFORM pg_temp.ok((SELECT status FROM logs WHERE id = pg_temp.c('L1')) = 'rewatched', '08 a rewatch is marked rewatched');
END $$;

DO $$ BEGIN
  PERFORM viewing_note_set(pg_temp.c('L1'), 'aaaaaaaa-0000-4000-8000-000000000001', 'rewatch note');
  PERFORM log_viewing_remove(pg_temp.c('L1'), 'aaaaaaaa-0000-4000-8000-000000000001');
  PERFORM log_viewing_remove(pg_temp.c('L1'), 'aaaaaaaa-0000-4000-8000-000000000001');  -- reaching the next line proves the retry did not throw
  PERFORM pg_temp.ok(true, '09 a retried removal does nothing, without an error');
  PERFORM pg_temp.ok((SELECT viewing_id FROM logs WHERE id = pg_temp.c('L1')) = pg_temp.c('V1'), '10 removing the rewatch brings the old viewing back');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM log_private_notes WHERE viewing_id = 'aaaaaaaa-0000-4000-8000-000000000001'), '11 the removed viewing takes its note with it');
  PERFORM pg_temp.ok((SELECT notes FROM log_private_notes WHERE viewing_id = pg_temp.c('V1')) = 'first viewing note', '12 the older note survives, untouched');
END $$;

DO $$ BEGIN
  BEGIN UPDATE logs SET viewing_history = '[]' WHERE id = pg_temp.c('L1');
        PERFORM pg_temp.ok(false, '13 a plain save cannot erase past viewings');
  EXCEPTION WHEN others THEN PERFORM pg_temp.ok(SQLERRM ILIKE '%past viewing%', '13 a plain save cannot erase past viewings'); END;
  BEGIN UPDATE logs SET viewing_id = gen_random_uuid() WHERE id = pg_temp.c('L1');
        PERFORM pg_temp.ok(false, '14 a plain save cannot swap the viewing');
  EXCEPTION WHEN others THEN PERFORM pg_temp.ok(SQLERRM ILIKE '%adding one or removing one%', '14 a plain save cannot swap the viewing'); END;
  BEGIN PERFORM viewing_note_set(pg_temp.c('L1'), pg_temp.c('V1'), repeat('x', 1001));
        PERFORM pg_temp.ok(false, '15 a note over 1,000 characters is refused');
  EXCEPTION WHEN others THEN PERFORM pg_temp.ok(SQLERRM ILIKE '%1,000%', '15 a note over 1,000 characters is refused'); END;
END $$;

-- the old build's path: a note arrives on the log column
DO $$ BEGIN
  UPDATE logs SET private_notes = 'from the old build' WHERE id = pg_temp.c('L2');
  PERFORM pg_temp.ok((SELECT notes FROM log_private_notes n JOIN logs l ON l.viewing_id = n.viewing_id WHERE l.id = pg_temp.c('L2')) = 'from the old build', '16 old build: a note on the column lands on the current viewing');
  PERFORM pg_temp.ok((SELECT private_notes FROM logs WHERE id = pg_temp.c('L2')) IS NULL, '17 old build: the column is blank again');
  UPDATE logs SET private_notes = '', rating = rating WHERE id = pg_temp.c('L2');
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM log_private_notes n JOIN logs l ON l.viewing_id = n.viewing_id WHERE l.id = pg_temp.c('L2')), '18 old build: an ordinary save with a blank note does NOT erase it');
END $$;

-- ── a stranger ────────────────────────────────────────────────────────
DO $$ BEGIN PERFORM pg_temp.as_member(pg_temp.c('stranger')); END $$;
DO $$ BEGIN
  PERFORM pg_temp.ok((SELECT count(*) FROM log_private_notes WHERE user_id = pg_temp.c('victim')) = 0, '19 a stranger reads none of the owner''s notes');
  BEGIN PERFORM viewing_note_set(pg_temp.c('L1'), pg_temp.c('V1'), 'overwrite'); EXCEPTION WHEN others THEN NULL; END;
  PERFORM viewing_note_remove(pg_temp.c('V1'));
  BEGIN PERFORM log_viewing_add(pg_temp.c('L1'), gen_random_uuid(), '{}'); EXCEPTION WHEN others THEN NULL; END;
  PERFORM log_viewing_remove(pg_temp.c('L1'), pg_temp.c('V1'));
END $$;
DO $$ BEGIN PERFORM pg_temp.as_member(pg_temp.c('victim')); END $$;
DO $$ BEGIN
  PERFORM pg_temp.ok((SELECT notes FROM log_private_notes WHERE viewing_id = pg_temp.c('V1')) = 'first viewing note', '20 a stranger can neither change nor remove the owner''s note');
  PERFORM pg_temp.ok((SELECT viewing_id FROM logs WHERE id = pg_temp.c('L1')) = pg_temp.c('V1'), '21 a stranger can neither add nor remove the owner''s viewings');
END $$;

-- ── a lapsed member ───────────────────────────────────────────────────
DO $$ BEGIN PERFORM pg_temp.as_member(pg_temp.c('lapsed')); END $$;
DO $$ DECLARE vid uuid; BEGIN
  SELECT viewing_id INTO vid FROM logs WHERE id = pg_temp.c('LL');
  PERFORM pg_temp.ok((SELECT notes FROM log_private_notes WHERE viewing_id = vid) = 'written while paid', '22 a lapsed member still reads their note');
  BEGIN PERFORM viewing_note_set(pg_temp.c('LL'), vid, 'changed');
        PERFORM pg_temp.ok(false, '23 a lapsed member cannot change it');
  EXCEPTION WHEN others THEN PERFORM pg_temp.ok(SQLERRM ILIKE '%Archivist%', '23 a lapsed member cannot change it'); END;
  PERFORM viewing_note_remove(vid);
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM log_private_notes WHERE viewing_id = vid), '24 a lapsed member can remove it');
END $$;

-- ── somebody else's viewing identity, read from their public history ──
-- 25: the stranger copies the owner's CURRENT viewing into a history of their
-- own and writes a note on it first; then the owner writes theirs.
DO $$ BEGIN PERFORM pg_temp.as_member(pg_temp.c('stranger')); END $$;
DO $$ DECLARE y uuid; lid uuid; BEGIN
  SELECT viewing_id INTO y FROM logs WHERE id = pg_temp.c('L3');
  INSERT INTO ctx VALUES ('Y', y::text);
  BEGIN
    INSERT INTO logs (user_id, film_id, film_title, watched_date, viewing_history)
      VALUES (pg_temp.c('stranger'), (SELECT v::int FROM ctx WHERE k='film1'), 'rehearsal', current_date,
              jsonb_build_array(jsonb_build_object('viewingId', y))) RETURNING id INTO lid;
    PERFORM viewing_note_set(lid, y, 'squatted');
    INSERT INTO ctx VALUES ('att25', 'the attack got through');
  EXCEPTION WHEN others THEN INSERT INTO ctx VALUES ('att25', 'the attack was refused: ' || SQLERRM); END;
END $$;
DO $$ BEGIN PERFORM pg_temp.as_member(pg_temp.c('victim')); END $$;
DO $$ DECLARE err text := 'no error'; BEGIN
  BEGIN PERFORM viewing_note_set(pg_temp.c('L3'), pg_temp.c('Y'), 'my own note');
  EXCEPTION WHEN others THEN err := SQLERRM; END;
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM log_private_notes WHERE viewing_id = pg_temp.c('Y') AND notes = 'my own note'),
    '25 nobody can take the owner''s viewing first and swallow their note — ' || (SELECT v FROM ctx WHERE k='att25') || '; owner saw: ' || err);
END $$;

-- 26: the stranger makes one of the owner's PAST viewings their own current
-- one; then the owner removes their rewatch, which makes that viewing current.
DO $$ BEGIN PERFORM pg_temp.as_member(pg_temp.c('stranger')); END $$;
DO $$ DECLARE x uuid; BEGIN
  SELECT (viewing_history->0->>'viewingId')::uuid INTO x FROM logs WHERE id = pg_temp.c('L2');
  INSERT INTO ctx VALUES ('X', x::text);
  BEGIN
    INSERT INTO logs (user_id, film_id, film_title, watched_date, viewing_id)
      VALUES (pg_temp.c('stranger'), (SELECT v::int FROM ctx WHERE k='film2'), 'rehearsal', current_date, x);
    INSERT INTO ctx VALUES ('att26', 'the attack got through');
  EXCEPTION WHEN others THEN INSERT INTO ctx VALUES ('att26', 'the attack was refused: ' || SQLERRM); END;
END $$;
DO $$ BEGIN PERFORM pg_temp.as_member(pg_temp.c('victim')); END $$;
DO $$ DECLARE cur uuid; err text := 'no error'; BEGIN
  SELECT viewing_id INTO cur FROM logs WHERE id = pg_temp.c('L2');
  BEGIN PERFORM log_viewing_remove(pg_temp.c('L2'), cur);
  EXCEPTION WHEN others THEN err := SQLERRM; END;
  PERFORM pg_temp.ok((SELECT viewing_id FROM logs WHERE id = pg_temp.c('L2')) = pg_temp.c('X'),
    '26 nobody can stop the owner removing their rewatch — ' || (SELECT v FROM ctx WHERE k='att26') || '; owner saw: ' || err);
END $$;

-- 27: the same through the app's own operation, and the refusal names it.
DO $$ BEGIN PERFORM pg_temp.as_member(pg_temp.c('stranger')); END $$;
DO $$ DECLARE err text := 'no error'; BEGIN
  BEGIN PERFORM log_viewing_add(pg_temp.c('SL'), pg_temp.c('V1'), '{}');
  EXCEPTION WHEN others THEN err := SQLERRM; END;
  PERFORM pg_temp.ok(err = 'That viewing belongs to another log.', '27 a rewatch cannot take another log''s viewing, and says so — saw: ' || err);
END $$;

-- 31 (its verdict is read at the end): the note wall on its own. The stranger
-- names the owner's viewing while writing on a log of THEIR OWN — no history
-- involved, so only the note's own check can stop it. Then the owner writes.
DO $$ DECLARE err text := 'no error'; BEGIN
  BEGIN PERFORM viewing_note_set(pg_temp.c('SL'), (SELECT viewing_id FROM logs WHERE id = pg_temp.c('L4')), 'on your viewing');
  EXCEPTION WHEN others THEN err := SQLERRM; END;
  INSERT INTO ctx VALUES ('att31', CASE WHEN err = 'no error' THEN 'the attack got through' ELSE 'the attack was refused: ' || err END);
END $$;
DO $$ BEGIN PERFORM pg_temp.as_member(pg_temp.c('victim')); END $$;
DO $$ DECLARE err text := 'no error'; vid uuid; BEGIN
  SELECT viewing_id INTO vid FROM logs WHERE id = pg_temp.c('L4');
  BEGIN PERFORM viewing_note_set(pg_temp.c('L4'), vid, 'mine, on my viewing');
  EXCEPTION WHEN others THEN err := SQLERRM; END;
  INSERT INTO ctx VALUES ('own31', err);
END $$;
DO $$ BEGIN PERFORM pg_temp.as_member(pg_temp.c('stranger')); END $$;

-- 28: the registry is closed to every member.
DO $$ BEGIN
  EXECUTE 'SELECT count(*) FROM public.viewings';
  PERFORM pg_temp.ok(false, '28 a member cannot read or write the registry');
EXCEPTION
  WHEN insufficient_privilege THEN PERFORM pg_temp.ok(true, '28 a member cannot read or write the registry');
  WHEN undefined_table THEN PERFORM pg_temp.ok(false, '28 a member cannot read or write the registry (there is no registry)');
END $$;

-- 29 (destructive, so last): deleting a log takes its viewings and notes.
DO $$ BEGIN PERFORM pg_temp.as_member(pg_temp.c('victim')); END $$;
DO $$ BEGIN
  DELETE FROM logs WHERE id = pg_temp.c('L1');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM log_private_notes WHERE log_id = pg_temp.c('L1')), '29 deleting a log takes its notes with it');
END $$;

RESET ROLE;

DO $$ BEGIN
  PERFORM pg_temp.ok(
    (SELECT notes FROM log_private_notes WHERE viewing_id = (SELECT viewing_id FROM logs WHERE id = pg_temp.c('L4'))) = 'mine, on my viewing',
    '31 a note can only be written on a viewing of the writer''s own log — ' || (SELECT v FROM ctx WHERE k='att31') || '; owner saw: ' || (SELECT v FROM ctx WHERE k='own31'));
END $$;

-- 30: every viewing that exists is registered to its own log, and nothing else is.
DO $$ DECLARE n_live bigint; n_reg bigint; n_bad bigint; BEGIN
  IF to_regclass('public.viewings') IS NULL THEN
    PERFORM pg_temp.ok(false, '30 every viewing is registered to exactly its own log (there is no registry)');
    RETURN;
  END IF;
  SELECT (SELECT count(*) FROM logs) + (SELECT count(*) FROM logs, jsonb_array_elements(viewing_history)) INTO n_live;
  EXECUTE 'SELECT count(*) FROM public.viewings' INTO n_reg;
  EXECUTE $q$SELECT count(*) FROM (
      SELECT l.id, l.viewing_id AS vid FROM logs l
      UNION ALL SELECT l.id, (e->>'viewingId')::uuid FROM logs l, jsonb_array_elements(l.viewing_history) e) s
    WHERE NOT EXISTS (SELECT 1 FROM public.viewings v WHERE v.viewing_id = s.vid AND v.log_id = s.id)$q$ INTO n_bad;
  PERFORM pg_temp.ok(n_live = n_reg AND n_bad = 0, format('30 every viewing is registered to exactly its own log (%s viewings, %s registered, %s wrong)', n_live, n_reg, n_bad));
END $$;

SELECT verdict, what FROM r ORDER BY left(what, 2);
SELECT count(*) FILTER (WHERE verdict = 'PASS') AS passed, count(*) FILTER (WHERE verdict = 'FAIL') AS failed FROM r;
SELECT (SELECT v FROM ctx WHERE k = 'before_notes') AS notes_before, (SELECT v FROM ctx WHERE k = 'before_logs') AS logs_before;
ROLLBACK;

\echo == after the rollback: nothing changed
SELECT (SELECT count(*) FROM log_private_notes) AS notes_now,
       (SELECT count(*) FROM logs)              AS logs_now,
       (SELECT tier FROM profiles WHERE id = 'fc717f12-c82e-41b4-b608-5cd39e4ac18d') AS stranger_tier,
       (SELECT count(*) FROM logs WHERE film_title = 'rehearsal') AS rehearsal_logs;
