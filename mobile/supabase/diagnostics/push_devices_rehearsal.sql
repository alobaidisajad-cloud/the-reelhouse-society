-- ════════════════════════════════════════════════════════════════════════════
-- push_devices_rehearsal.sql — does every device a member signs in on get heard?
-- ════════════════════════════════════════════════════════════════════════════
--   psql "$SUPABASE_DB_URL" -X -q -t -A -f mobile/supabase/diagnostics/push_devices_rehearsal.sql
--
-- Runs against the LIVE push_tokens rules, as two members, inside one
-- transaction that ROLLS BACK. Nothing is kept. The tokens are made up
-- ("rehearsal-…"), and only they are counted — except the cap, which counts a
-- member's rows as the rule does. Production runs it by hand;
-- db-integration.yml runs it on the sealed copy (e2e/db/rehearsals.mjs).
-- Read each NOTICE as  case|expected|got ; the last line is the verdict, and
-- any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

-- Two members who exist (their writes here are rolled back).
CREATE TEMP TABLE rehearsal_members ON COMMIT DROP AS
  SELECT id, row_number() OVER (ORDER BY created_at) AS n FROM auth.users ORDER BY created_at LIMIT 2;
SELECT pg_temp.rh_need('members with a sign-in', (SELECT count(*) FROM rehearsal_members), 2) AS done \gset rh_
GRANT SELECT ON rehearsal_members TO authenticated;

-- One transaction has one now(), so every registration here would tie. Before
-- each reinstall the member's devices are made a minute older, as time would.
CREATE FUNCTION pg_temp.a_minute_passes(u uuid) RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE public.push_tokens SET updated_at = updated_at - interval '1 minute' WHERE user_id = u $$;
GRANT EXECUTE ON FUNCTION pg_temp.a_minute_passes(uuid) TO authenticated;

SET LOCAL ROLE authenticated;
DO $$
DECLARE
  a uuid := (SELECT id FROM rehearsal_members WHERE n = 1);
  b uuid := (SELECT id FROM rehearsal_members WHERE n = 2);
  mine int;
  as_member CONSTANT text := '{"sub":"%s","role":"authenticated"}';
BEGIN
  PERFORM set_config('request.jwt.claims', format(as_member, a), true);
  PERFORM public.register_push_token('ExponentPushToken[rehearsal-A-iphone]', 'ios');
  SELECT count(*) INTO mine FROM public.push_tokens WHERE token LIKE 'ExponentPushToken[rehearsal-%';
  PERFORM pg_temp.rh_case('a member signs in on an iPhone', '1', mine::text);

  PERFORM public.register_push_token('ExponentPushToken[rehearsal-A-ipad]', 'ios');
  SELECT count(*) INTO mine FROM public.push_tokens WHERE token LIKE 'ExponentPushToken[rehearsal-%';
  PERFORM pg_temp.rh_case('and on an iPad: both are heard', '2', mine::text);

  PERFORM public.register_push_token('ExponentPushToken[rehearsal-A-pixel]', 'android');
  SELECT count(*) INTO mine FROM public.push_tokens WHERE token LIKE 'ExponentPushToken[rehearsal-%';
  PERFORM pg_temp.rh_case('and on an Android phone: all three', '3', mine::text);

  -- The iPad changes hands: the second member signs in on it.
  PERFORM set_config('request.jwt.claims', format(as_member, b), true);
  PERFORM public.register_push_token('ExponentPushToken[rehearsal-A-ipad]', 'ios');
  SELECT count(*) INTO mine FROM public.push_tokens WHERE token = 'ExponentPushToken[rehearsal-A-ipad]';
  PERFORM pg_temp.rh_case('a device that changes hands is the new member''s', '1', mine::text);

  PERFORM set_config('request.jwt.claims', format(as_member, a), true);
  SELECT count(*) INTO mine FROM public.push_tokens WHERE token LIKE 'ExponentPushToken[rehearsal-%';
  PERFORM pg_temp.rh_case('and no longer the old member''s (the old member keeps the rest)', '2', mine::text);

  -- Signing out of the iPhone removes the iPhone's token alone (the app's path).
  DELETE FROM public.push_tokens WHERE user_id = a AND token = 'ExponentPushToken[rehearsal-A-iphone]';
  SELECT count(*) INTO mine FROM public.push_tokens WHERE token LIKE 'ExponentPushToken[rehearsal-%';
  PERFORM pg_temp.rh_case('signing out of one device leaves the others', '1', mine::text);

  -- Twelve reinstalls later: the member's ten most recent devices, no more.
  FOR i IN 1..12 LOOP
    PERFORM pg_temp.a_minute_passes(a);
    PERFORM public.register_push_token(format('ExponentPushToken[rehearsal-A-reinstall-%s]', i), 'ios');
  END LOOP;
  SELECT count(*) INTO mine FROM public.push_tokens;   -- every row this member can see: their own
  PERFORM pg_temp.rh_case('a member''s devices are capped at ten', '10', mine::text);
  SELECT count(*) INTO mine FROM public.push_tokens WHERE token = 'ExponentPushToken[rehearsal-A-reinstall-12]';
  PERFORM pg_temp.rh_case('and the newest is one of them', '1', mine::text);
END $$;
RESET ROLE;

SELECT pg_temp.rh_verdict();
ROLLBACK;
