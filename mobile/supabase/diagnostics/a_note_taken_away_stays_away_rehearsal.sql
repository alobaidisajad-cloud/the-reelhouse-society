-- ════════════════════════════════════════════════════════════════════════════
-- a_note_taken_away_stays_away_rehearsal.sql — 20261119_10. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_note_taken_away_stays_away_rehearsal.sql --with-train
--
-- The train applies 20261119_10 here (with_train), 20261119_00 to 20261119_09 already applied; a sealed copy already holds it.
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
CREATE TEMP TABLE ha5_read (got text) ON COMMIT DROP;
GRANT ALL ON ha5_read TO authenticated;

-- The train applies it here first (with_train), on production as the cars before it left it; a sealed
-- copy already holds every pending migration.
-- 20261119_10 is applied on production (the train of 2026-11-19); this shows it still holds there.

-- ── H-A5 ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.interaction_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interaction_churn WHERE user_id IN (SELECT id FROM rehearsal_members);
-- ── H-A5 rehearsal · a Vault note taken away stays away from a note written before it (round 13) ──
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train (pg_temp.rh_case,
-- rolled back with the rest), with its rehearsal_members (n = 1..4). Member 1, ranked for the Vault
-- for the run, keeps a record; everything is done as the members themselves.
--   · A note written ten minutes ago is taken away now; a note written five minutes ago, sent late
--     from another phone, is done unwritten, and every reader finds no note.
--   · Taken away by the form from before (no moment, the house's now): a note written a minute ago is
--     done unwritten too.
--   · A note written after the removal lands, and the kept moment goes.
--   · A removal older than the note standing leaves the note, and keeps no moment.
--   · Another member's removal of member 1's viewing takes nothing and keeps nothing.
--   · The form from before writes over a removal (its moment is now).
--   · The rank still judges: member 4, unranked for the run, is refused at the Vault's door.

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
SELECT count(*) AS done FROM rehearsal_members m, public.grant_entitlement(m.id, 'archivist', 'manual') g
 WHERE m.n IN (1, 2) \gset rh_
CREATE TEMP TABLE ha5_log ON COMMIT DROP AS
WITH made AS (
  INSERT INTO public.logs (user_id, film_id, film_title, watched_date)
  VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), 990682, 'rh H-A5 film', current_date)
  RETURNING id, viewing_id)
SELECT id, viewing_id FROM made;
GRANT SELECT ON ha5_log TO authenticated;
SELECT pg_temp.rh_found('the record''s viewing', (SELECT viewing_id FROM ha5_log)) AS done \gset rh_

CREATE FUNCTION pg_temp.ha5_as(p_member bigint, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_code text; v_out text := 'ok';
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = p_member), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_code = RETURNED_SQLSTATE;
    v_out := v_code;
  END;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v_out;
END $$;
CREATE FUNCTION pg_temp.ha5_set(p_words text, p_ago interval) RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT public.viewing_note_set(%L, %L, %L, %L::timestamptz)',
    (SELECT id FROM ha5_log), (SELECT viewing_id FROM ha5_log), p_words, now() - p_ago);
$$;
CREATE FUNCTION pg_temp.ha5_remove(p_ago interval) RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT public.viewing_note_remove(%L, %L::timestamptz)', (SELECT viewing_id FROM ha5_log), now() - p_ago);
$$;
-- The note as its own member reads it, as every reader of notes reads it: the table, under its rule.
CREATE FUNCTION pg_temp.ha5_note() RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM ha5_read;
  PERFORM pg_temp.ha5_as(1, format(
    'INSERT INTO ha5_read SELECT coalesce((SELECT notes FROM public.log_private_notes WHERE viewing_id = %L), %L)',
    (SELECT viewing_id FROM ha5_log), '(none)'));
  RETURN (SELECT got FROM ha5_read);
END $$;
CREATE FUNCTION pg_temp.ha5_kept() RETURNS text LANGUAGE sql AS $$
  SELECT count(*)::text FROM public.viewing_notes_removed WHERE viewing_id = (SELECT viewing_id FROM ha5_log);
$$;

-- ── taken away now, an older note sent late ──
SELECT pg_temp.rh_case('a note written ten minutes ago lands', 'ok|B',
  pg_temp.ha5_as(1, pg_temp.ha5_set('B', interval '10 minutes')) || '|' || pg_temp.ha5_note()) AS done \gset rh_
SELECT pg_temp.rh_case('taken away now, its moment kept', 'ok|(none)|1',
  pg_temp.ha5_as(1, pg_temp.ha5_remove(interval '0')) || '|' || pg_temp.ha5_note() || '|' || pg_temp.ha5_kept()) AS done \gset rh_
SELECT pg_temp.rh_case('a note written five minutes ago, sent late from another phone, is done without a word', 'ok',
  pg_temp.ha5_as(1, pg_temp.ha5_set('A', interval '5 minutes'))) AS done \gset rh_
SELECT pg_temp.rh_case('and every reader finds no note', '(none)', pg_temp.ha5_note()) AS done \gset rh_

-- ── a note written after the removal ──
SELECT pg_temp.rh_case('a note written after the removal lands, and the kept moment goes', 'ok|C|0',
  pg_temp.ha5_as(1, pg_temp.ha5_set('C', interval '0')) || '|' || pg_temp.ha5_note() || '|' || pg_temp.ha5_kept()) AS done \gset rh_

-- ── a removal older than the note standing ──
SELECT pg_temp.rh_case('an emptied note from two minutes ago leaves the later note, and keeps no moment', 'ok|C|0',
  pg_temp.ha5_as(1, pg_temp.ha5_set('', interval '2 minutes')) || '|' || pg_temp.ha5_note() || '|' || pg_temp.ha5_kept()) AS done \gset rh_

-- ── another member ──
SELECT pg_temp.rh_case('another member''s removal of the viewing takes nothing and keeps nothing', 'ok|C|0',
  pg_temp.ha5_as(2, pg_temp.ha5_remove(interval '0')) || '|' || pg_temp.ha5_note() || '|' || pg_temp.ha5_kept()) AS done \gset rh_
SELECT pg_temp.rh_case('nor writes on it', 'true',
  (SELECT (pg_temp.ha5_as(2, pg_temp.ha5_set('forged', interval '0')) <> 'ok'))::text || '') AS done \gset rh_
SELECT pg_temp.rh_case('the note is still its own member''s', 'C', pg_temp.ha5_note()) AS done \gset rh_

-- ── the forms from before ──
SELECT pg_temp.rh_case('taken away by the form from before, its moment kept as the house''s now', 'ok|(none)|1',
  pg_temp.ha5_as(1, format('SELECT public.viewing_note_remove(%L)', (SELECT viewing_id FROM ha5_log)))
  || '|' || pg_temp.ha5_note() || '|' || pg_temp.ha5_kept()) AS done \gset rh_
SELECT pg_temp.rh_case('so a note written a minute ago is done unwritten', 'ok|(none)',
  pg_temp.ha5_as(1, pg_temp.ha5_set('D', interval '1 minute')) || '|' || pg_temp.ha5_note()) AS done \gset rh_
SELECT pg_temp.rh_case('the form from before writes over a removal, as written now', 'ok|E|0',
  pg_temp.ha5_as(1, format('SELECT public.viewing_note_set(%L, %L, %L)', (SELECT id FROM ha5_log), (SELECT viewing_id FROM ha5_log), 'E'))
  || '|' || pg_temp.ha5_note() || '|' || pg_temp.ha5_kept()) AS done \gset rh_
SELECT pg_temp.rh_case('and empties it, its moment kept', 'ok|(none)|1',
  pg_temp.ha5_as(1, format('SELECT public.viewing_note_set(%L, %L, %L)', (SELECT id FROM ha5_log), (SELECT viewing_id FROM ha5_log), ''))
  || '|' || pg_temp.ha5_note() || '|' || pg_temp.ha5_kept()) AS done \gset rh_

-- ── the rank still judges ──
UPDATE public.profiles SET tier = 'free', role = 'cinephile', is_founding = false
 WHERE id = (SELECT id FROM rehearsal_members WHERE n = 4);
DELETE FROM public.rank_grants WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 4);
CREATE TEMP TABLE ha5_log4 ON COMMIT DROP AS
WITH made AS (
  INSERT INTO public.logs (user_id, film_id, film_title, watched_date)
  VALUES ((SELECT id FROM rehearsal_members WHERE n = 4), 990682, 'rh H-A5 film', current_date)
  RETURNING id, viewing_id)
SELECT id, viewing_id FROM made;
SELECT pg_temp.rh_case('an unranked member is refused at the Vault''s door, as before', '42501',
  pg_temp.ha5_as(4, format('SELECT public.viewing_note_set(%L, %L, %L, now())', (SELECT id FROM ha5_log4), (SELECT viewing_id FROM ha5_log4), 'rh unranked'))) AS done \gset rh_

-- ── a set and a removal at the same moment go one after the other ──
-- Two sessions cannot be held in one transaction (proved with two sessions on the local PostgreSQL,
-- both orders: without the lock the older note stood after the later removal); each form is read for
-- the lock that makes them wait on each other.
SELECT pg_temp.rh_case('both forms take the viewing''s lock before they read', 'true|true',
  (SELECT string_agg((position('pg_advisory_xact_lock(hashtext(''note:''' in pg_get_functiondef(p::regprocedure)) > 0)::text, '|' ORDER BY p)
     FROM unnest(ARRAY['public.viewing_note_remove(uuid,timestamptz)', 'public.viewing_note_set(uuid,uuid,text,timestamptz)']) p)) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
