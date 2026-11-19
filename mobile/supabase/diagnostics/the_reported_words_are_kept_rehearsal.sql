-- ════════════════════════════════════════════════════════════════════════════
-- the_reported_words_are_kept_rehearsal.sql — 20261120_22. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs the_reported_words_are_kept_rehearsal.sql --with-train
--
-- The train applies 20261120_22 here (with_train), 20261120_00 to 20261120_21 already applied; a sealed copy already holds it.
-- Then the house and members in good standing, acting as themselves, find what it fixes holding (review round 14).
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
GRANT SELECT ON rehearsal_members TO anon, authenticated;

-- The train applies it here first (with_train), on production as the cars before it left it; a sealed
-- copy already holds every pending migration.
\if :{?with_train}
\ir ../../../supabase/migrations/20261120_22_the_reported_words_are_kept.sql
\endif

-- ── H-B5.table ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.interaction_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interaction_churn WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.critique_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.analytics_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.salon_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
-- ── H-B5's table rehearsal · the reported words are the house's alone (review round 14) ──
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and H-B5.table, with its
-- rehearsal_members (n = 1..4). Member 1, as themselves, may neither read nor write the table; a visitor
-- neither. The table stands, keyed by its report, and a report's words go with the report.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

CREATE FUNCTION pg_temp.hb5t_as(p_member bigint, p_role text, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_got text;
BEGIN
  IF p_member IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = p_member), 'role', p_role)::text, true);
  END IF;
  PERFORM set_config('role', p_role, true);
  BEGIN
    EXECUTE p_sql INTO v_got;
  EXCEPTION WHEN OTHERS THEN
    v_got := 'refused: ' || SQLSTATE;
  END;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN coalesce(v_got, 'none');
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.hb5t_as(bigint, text, text) TO authenticated, anon;

SELECT pg_temp.rh_case('a member reads the reported words', 'refused: 42501',
  pg_temp.hb5t_as(1, 'authenticated', 'SELECT count(*)::text FROM public.reported_words'));
SELECT pg_temp.rh_case('a member writes reported words', 'refused: 42501',
  pg_temp.hb5t_as(1, 'authenticated', 'INSERT INTO public.reported_words (report_id, words) VALUES (gen_random_uuid(), ''{}'') RETURNING ''written'''));
SELECT pg_temp.rh_case('a visitor reads the reported words', 'refused: 42501',
  pg_temp.hb5t_as(NULL, 'anon', 'SELECT count(*)::text FROM public.reported_words'));
SELECT pg_temp.rh_case('row security is on', 'true',
  (SELECT relrowsecurity::text FROM pg_class WHERE oid = 'public.reported_words'::regclass));
SELECT pg_temp.rh_case('a report''s words go with the report', 'c',
  (SELECT confdeltype::text FROM pg_constraint WHERE conrelid = 'public.reported_words'::regclass AND contype = 'f'));

SELECT pg_temp.rh_verdict();
ROLLBACK;
