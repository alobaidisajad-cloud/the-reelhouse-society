-- ════════════════════════════════════════════════════════════════════════════
-- a_note_written_later_stands_rehearsal.sql — 20261119_08. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_note_written_later_stands_rehearsal.sql --with-train
--
-- The train applies 20261119_08 here (with_train), 20261119_00 to 20261119_07 already applied; a sealed copy already holds it.
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

-- The train applies it here first (with_train), on production as the cars before it left it; a sealed
-- copy already holds every pending migration.
-- 20261119_08 is applied on production (the train of 2026-11-19); this shows it still holds there.

-- ── H-A1 ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.interaction_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interaction_churn WHERE user_id IN (SELECT id FROM rehearsal_members);
-- ── H-A1 rehearsal · a Vault note written earlier never lands over one written later (review round 13) ──
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train (pg_temp.rh_case,
-- rolled back with the rest), with its rehearsal_members (n = 1..4). Member 1, ranked for the Vault for
-- the run, keeps a record; as themselves they write "B" a minute ago, then a queue sends "A", written
-- five minutes ago: "B" stands, and no refusal is said. A removal from five minutes ago leaves "B"; "C"
-- written now lands; a removal now takes it away. A moment ahead of the house's clock is kept as now.
-- The forms from before (no moment) still write and remove. Member 2, as themselves, writes on member
-- 1's viewing and is refused, as before.

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
SELECT count(*) AS done FROM rehearsal_members m, public.grant_entitlement(m.id, 'archivist', 'manual') g
 WHERE m.n IN (1, 2) \gset rh_
CREATE TEMP TABLE ha1_log ON COMMIT DROP AS
WITH made AS (
  INSERT INTO public.logs (user_id, film_id, film_title, watched_date)
  VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), 990681, 'rh H-A1 film', current_date)
  RETURNING id, viewing_id)
SELECT id, viewing_id FROM made;
GRANT SELECT ON ha1_log TO authenticated;
SELECT pg_temp.rh_found('the record''s viewing', (SELECT viewing_id FROM ha1_log)) AS done \gset rh_

CREATE FUNCTION pg_temp.ha1_as(p_member bigint, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
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
CREATE FUNCTION pg_temp.ha1_set(p_words text, p_ago interval) RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT public.viewing_note_set(%L, %L, %L, %L::timestamptz)',
    (SELECT id FROM ha1_log), (SELECT viewing_id FROM ha1_log), p_words, now() - p_ago);
$$;
CREATE FUNCTION pg_temp.ha1_remove(p_ago interval) RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT public.viewing_note_remove(%L, %L::timestamptz)', (SELECT viewing_id FROM ha1_log), now() - p_ago);
$$;
CREATE FUNCTION pg_temp.ha1_note() RETURNS text LANGUAGE sql AS $$
  SELECT coalesce((SELECT notes FROM public.log_private_notes WHERE viewing_id = (SELECT viewing_id FROM ha1_log)), '(none)');
$$;

SELECT pg_temp.rh_case('a note written a minute ago lands', 'ok|B',
  pg_temp.ha1_as(1, pg_temp.ha1_set('B', interval '1 minute')) || '|' || pg_temp.ha1_note()) AS done \gset rh_
SELECT pg_temp.rh_case('the queue''s older note, written five minutes ago, is done without a word', 'ok',
  pg_temp.ha1_as(1, pg_temp.ha1_set('A', interval '5 minutes'))) AS done \gset rh_
SELECT pg_temp.rh_case('and the later note stands', 'B', pg_temp.ha1_note()) AS done \gset rh_
SELECT pg_temp.rh_case('a removal from five minutes ago leaves the later note', 'ok',
  pg_temp.ha1_as(1, pg_temp.ha1_remove(interval '5 minutes'))) AS done \gset rh_
SELECT pg_temp.rh_case('which still stands', 'B', pg_temp.ha1_note()) AS done \gset rh_
SELECT pg_temp.rh_case('an emptied note from five minutes ago leaves it too', 'ok',
  pg_temp.ha1_as(1, pg_temp.ha1_set('', interval '5 minutes'))) AS done \gset rh_
SELECT pg_temp.rh_case('still', 'B', pg_temp.ha1_note()) AS done \gset rh_
SELECT pg_temp.rh_case('a note written now lands over it', 'ok',
  pg_temp.ha1_as(1, pg_temp.ha1_set('C', interval '0'))) AS done \gset rh_
SELECT pg_temp.rh_case('and is the note', 'C', pg_temp.ha1_note()) AS done \gset rh_
SELECT pg_temp.rh_case('a removal now takes it away', 'ok',
  pg_temp.ha1_as(1, pg_temp.ha1_remove(interval '0'))) AS done \gset rh_
SELECT pg_temp.rh_case('and the viewing has no note', '(none)', pg_temp.ha1_note()) AS done \gset rh_
SELECT pg_temp.rh_case('a note from a phone a day ahead of the house lands', 'ok',
  pg_temp.ha1_as(1, pg_temp.ha1_set('D', interval '-1 day'))) AS done \gset rh_
SELECT pg_temp.rh_case('kept as written now, never a day ahead', 'D|0',
  pg_temp.ha1_note() || '|' || (SELECT extract(epoch FROM updated_at - now())::integer::text
                                  FROM public.log_private_notes WHERE viewing_id = (SELECT viewing_id FROM ha1_log))) AS done \gset rh_
SELECT pg_temp.rh_case('so a note written now still lands after it', 'ok|E',
  pg_temp.ha1_as(1, pg_temp.ha1_set('E', interval '0')) || '|' || pg_temp.ha1_note()) AS done \gset rh_
SELECT pg_temp.rh_case('the form from before still writes', 'ok|F',
  pg_temp.ha1_as(1, format('SELECT public.viewing_note_set(%L, %L, %L)', (SELECT id FROM ha1_log), (SELECT viewing_id FROM ha1_log), 'F'))
  || '|' || pg_temp.ha1_note()) AS done \gset rh_
SELECT pg_temp.rh_case('and removes', 'ok|(none)',
  pg_temp.ha1_as(1, format('SELECT public.viewing_note_remove(%L)', (SELECT viewing_id FROM ha1_log))) || '|' || pg_temp.ha1_note()) AS done \gset rh_
CREATE TEMP TABLE ha1_forged ON COMMIT DROP AS
SELECT pg_temp.ha1_as(2, format('SELECT public.viewing_note_set(%L, %L, %L)', (SELECT id FROM ha1_log), (SELECT viewing_id FROM ha1_log), 'forged')) AS before,
       pg_temp.ha1_as(2, pg_temp.ha1_set('forged', interval '0')) AS now_;
SELECT pg_temp.rh_case('another member writing on the viewing is refused, as the form from before refuses it', 'true',
  (SELECT (now_ <> 'ok' AND now_ = before)::text FROM ha1_forged)) AS done \gset rh_
SELECT pg_temp.rh_case('and writes nothing', '(none)', pg_temp.ha1_note()) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
