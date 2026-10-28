-- ════════════════════════════════════════════════════════════════════════════
-- the_house_floor_rehearsal.sql — 20261028_01. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs the_house_floor_rehearsal.sql --with-train
--
-- With with_train set, 20261028_01 is applied first, inside this transaction
-- (production, before the apply); without it, it must already be applied
-- (db-integration.yml, after up-down-up). The floor is one row that turns no
-- build away; a visitor and a member read the two floors and nothing else, and
-- neither may change them; a second row is refused. Then a member's notice is
-- filed twice as the house, the push switch on and off: on, its push is queued
-- for notify-push; off, nothing is queued and the notice is filed all the same.
-- Read each NOTICE as  case|expected|got ; the last line is the verdict, and
-- any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql
\if :{?with_train}
\ir ../../../supabase/migrations/20261028_01_the_house_floor.sql
\endif

-- As the house: claims cleared, so no member's gate judges the setup.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
CREATE TEMP TABLE rh_who (what text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT ON rh_who TO authenticated;
INSERT INTO rh_who
SELECT 'member', pg_temp.rh_found('a member to read the floor and be notified',
  (SELECT id FROM public.profiles WHERE role <> 'admin' ORDER BY created_at LIMIT 1));
-- Their notices allowed, whatever they chose before: the switch alone decides here.
UPDATE public.profiles SET preferences = '{}'::jsonb WHERE id = (SELECT id FROM rh_who WHERE what = 'member');

-- A call tried alone and kept: 'ok', or its SQLSTATE.
CREATE FUNCTION pg_temp.rh_try(stmt text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE stmt;
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE;
END $$;
CREATE TEMP TABLE rh_got (what text PRIMARY KEY, got text) ON COMMIT DROP;
GRANT INSERT ON rh_got TO anon, authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.rh_try(text) TO anon, authenticated;

-- ── as a visitor, then as the member ─────────────────────────────────────────
DO $$
DECLARE v_floor text;
BEGIN
  PERFORM set_config('role', 'anon', true);
  SELECT min_build_ios || '/' || min_build_android INTO v_floor FROM public.house_settings;
  INSERT INTO rh_got VALUES ('a visitor reads the floors', v_floor);
  INSERT INTO rh_got VALUES ('a visitor reads a switch', pg_temp.rh_try('SELECT pushes_sent FROM public.house_settings'));
  INSERT INTO rh_got VALUES ('a visitor raises the floor',
    pg_temp.rh_try('UPDATE public.house_settings SET min_build_ios = 99'));
  PERFORM set_config('role', 'none', true);

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', (SELECT id FROM rh_who WHERE what = 'member'), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT min_build_ios || '/' || min_build_android INTO v_floor FROM public.house_settings;
  INSERT INTO rh_got VALUES ('the member reads the floors', v_floor);
  INSERT INTO rh_got VALUES ('the member reads a switch', pg_temp.rh_try('SELECT films_synced FROM public.house_settings'));
  INSERT INTO rh_got VALUES ('the member lowers the floor',
    pg_temp.rh_try('UPDATE public.house_settings SET min_build_android = 0'));
  INSERT INTO rh_got VALUES ('the member switches pushes off',
    pg_temp.rh_try('UPDATE public.house_settings SET pushes_sent = false'));
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
END $$;

-- The floor as the migration leaves it, before the notices below switch the pushes off.
CREATE TEMP TABLE rh_floor ON COMMIT DROP AS
SELECT (SELECT count(*) FROM public.house_settings)::text || '|' || min_build_ios || '|' || min_build_android
       || '|' || pushes_sent || '|' || films_synced AS was
FROM public.house_settings;

-- ── a notice, filed with the switch on and off ───────────────────────────────
CREATE TEMP TABLE rh_queued (what text PRIMARY KEY, n bigint) ON COMMIT DROP;
INSERT INTO rh_queued SELECT 'before', count(*) FROM net.http_request_queue;
INSERT INTO public.notifications (user_id, type, message)
VALUES ((SELECT id FROM rh_who WHERE what = 'member'), 'system', 'rh notice, the switch on');
INSERT INTO rh_queued SELECT 'switch on', count(*) FROM net.http_request_queue;
UPDATE public.house_settings SET pushes_sent = false;
INSERT INTO public.notifications (user_id, type, message)
VALUES ((SELECT id FROM rh_who WHERE what = 'member'), 'system', 'rh notice, the switch off');
INSERT INTO rh_queued SELECT 'switch off', count(*) FROM net.http_request_queue;

-- ── the verdict ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM pg_temp.rh_case('one floor, turning no build away, both switches on', '1|0|0|true|true',
    (SELECT was FROM rh_floor));
  PERFORM pg_temp.rh_case('a second floor is refused', '23505',
    pg_temp.rh_try('INSERT INTO public.house_settings DEFAULT VALUES'));
  PERFORM pg_temp.rh_case('a visitor reads the two floors', '0/0', (SELECT got FROM rh_got WHERE what = 'a visitor reads the floors'));
  PERFORM pg_temp.rh_case('and no switch', '42501', (SELECT got FROM rh_got WHERE what = 'a visitor reads a switch'));
  PERFORM pg_temp.rh_case('and cannot raise the floor', '42501', (SELECT got FROM rh_got WHERE what = 'a visitor raises the floor'));
  PERFORM pg_temp.rh_case('a member reads the two floors', '0/0', (SELECT got FROM rh_got WHERE what = 'the member reads the floors'));
  PERFORM pg_temp.rh_case('and no switch', '42501', (SELECT got FROM rh_got WHERE what = 'the member reads a switch'));
  PERFORM pg_temp.rh_case('and cannot lower the floor', '42501', (SELECT got FROM rh_got WHERE what = 'the member lowers the floor'));
  PERFORM pg_temp.rh_case('nor switch the pushes off', '42501', (SELECT got FROM rh_got WHERE what = 'the member switches pushes off'));
  PERFORM pg_temp.rh_case('the switch on: a notice''s push is queued for notify-push', '1',
    ((SELECT n FROM rh_queued WHERE what = 'switch on') - (SELECT n FROM rh_queued WHERE what = 'before'))::text);
  PERFORM pg_temp.rh_case('the switch off: none is, and the notice is filed all the same', '0|1',
    ((SELECT n FROM rh_queued WHERE what = 'switch off') - (SELECT n FROM rh_queued WHERE what = 'switch on'))::text || '|'
    || (SELECT count(*) FROM public.notifications WHERE message = 'rh notice, the switch off')::text);
END $$;

SELECT pg_temp.rh_verdict();
ROLLBACK;
