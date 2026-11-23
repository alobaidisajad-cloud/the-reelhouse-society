-- ════════════════════════════════════════════════════════════════════════════
-- a_records_withholding_is_no_part_of_a_viewing_rehearsal.sql — 20261122_01. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_records_withholding_is_no_part_of_a_viewing_rehearsal.sql
--
-- 20261122_01 is applied on production (the second train of 2026-11-22); this shows it still holds there, and on every sealed copy.
-- Then the house and a member, acting as themselves, find what it fixes holding.
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
   ORDER BY u.created_at LIMIT 1;
SELECT pg_temp.rh_need('a member in good standing', (SELECT count(*) FROM rehearsal_members), 1) AS done \gset rh_
GRANT SELECT ON rehearsal_members TO authenticated;

-- ── a record's withholding is no part of a viewing ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
SELECT pg_temp.rh_case('withheld_at is named a record''s own column, never a viewing''s', 'true|false',
  (public.viewing_fields() -> 'not_a_viewing' @> '["withheld_at"]'::jsonb)::text || '|'
  || (public.viewing_fields() -> 'archived' ? 'withheld_at')::text) AS done \gset rh_
SELECT pg_temp.rh_case('every column of a log is said to be part of a viewing or not', '',
  array_to_string(public.viewing_fields_uncovered(), ', ')) AS done \gset rh_

-- A member asks the same, as the house's own readers of a viewing do.
CREATE FUNCTION pg_temp.rv_as_member(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_got text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 1), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  BEGIN
    EXECUTE p_sql INTO v_got;
  EXCEPTION WHEN OTHERS THEN
    v_got := 'refused: ' || SQLSTATE || ' ' || SQLERRM;
  END;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN coalesce(v_got, 'none');
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.rv_as_member(text) TO authenticated;
SELECT pg_temp.rh_case('a member reads no column left undecided', '',
  pg_temp.rv_as_member('SELECT array_to_string(public.viewing_fields_uncovered(), '', '')')) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
