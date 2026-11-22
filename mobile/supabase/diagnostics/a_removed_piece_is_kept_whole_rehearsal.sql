-- ════════════════════════════════════════════════════════════════════════════
-- a_removed_piece_is_kept_whole_rehearsal.sql — 20261120_30. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_removed_piece_is_kept_whole_rehearsal.sql
--
-- 20261120_30 is applied on production (the train of 2026-11-22); this shows it still holds there, and on every sealed copy.
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

-- ── H-B10.table ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.interaction_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interaction_churn WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.critique_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.analytics_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.salon_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
-- ── H-B10's table rehearsal · the withheld pieces are the house's alone (review round 14) ──
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and H-B10.table, with its
-- rehearsal_members (n = 1..4). A member, as themselves, may neither read nor write the table; a visitor
-- neither. The table stands, keyed by its verdict, and goes with it.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
CREATE FUNCTION pg_temp.hb10t_as(p_member bigint, p_role text, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
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
GRANT EXECUTE ON FUNCTION pg_temp.hb10t_as(bigint, text, text) TO authenticated, anon;
SELECT pg_temp.rh_case('a member reads the withheld pieces', 'refused: 42501',
  pg_temp.hb10t_as(1, 'authenticated', 'SELECT count(*)::text FROM public.withheld_pieces'));
SELECT pg_temp.rh_case('a member writes one', 'refused: 42501',
  pg_temp.hb10t_as(1, 'authenticated', 'INSERT INTO public.withheld_pieces (mod_action_id, kind, piece_id) VALUES (gen_random_uuid(), ''log'', gen_random_uuid()) RETURNING ''written'''));
SELECT pg_temp.rh_case('a visitor reads them', 'refused: 42501',
  pg_temp.hb10t_as(NULL, 'anon', 'SELECT count(*)::text FROM public.withheld_pieces'));
SELECT pg_temp.rh_case('row security is on', 'true',
  (SELECT relrowsecurity::text FROM pg_class WHERE oid = 'public.withheld_pieces'::regclass));
-- The house withholding one piece under two verdicts: the second is refused by the piece's own key.
CREATE FUNCTION pg_temp.hb10t_twice() RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_piece uuid := gen_random_uuid(); v_n integer := 0; v_m uuid;
BEGIN
  FOR i IN 1..2 LOOP
    INSERT INTO public.mod_actions (target_user_id, admin_id, action, reason)
    VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), (SELECT id FROM rehearsal_members WHERE n = 4), 'delete_content', 'rh twice')
    RETURNING id INTO v_m;
    BEGIN
      INSERT INTO public.withheld_pieces (mod_action_id, kind, piece_id) VALUES (v_m, 'log', v_piece);
      v_n := v_n + 1;
    EXCEPTION WHEN unique_violation THEN
      RETURN v_n::text || ' kept, then refused: ' || SQLSTATE;
    END;
  END LOOP;
  RETURN v_n::text || ' kept';
END $$;
SELECT pg_temp.rh_case('a piece is withheld once at a time', '1 kept, then refused: 23505', pg_temp.hb10t_twice());
SELECT pg_temp.rh_case('a verdict says whether its overturn put the piece back; none has yet', 'boolean|0',
  (SELECT format_type(atttypid, atttypmod) FROM pg_attribute WHERE attrelid = 'public.mod_actions'::regclass AND attname = 'appeal_put_back')
  || '|' || (SELECT count(*)::text FROM public.mod_actions WHERE appeal_put_back IS NOT NULL));
SELECT pg_temp.rh_case('a withheld piece goes with its verdict', 'c',
  (SELECT confdeltype::text FROM pg_constraint WHERE conrelid = 'public.withheld_pieces'::regclass AND contype = 'f'));

SELECT pg_temp.rh_verdict();
ROLLBACK;
