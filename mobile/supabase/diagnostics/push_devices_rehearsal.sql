-- ════════════════════════════════════════════════════════════════════════════
-- push_devices_rehearsal.sql — does every device a member signs in on get heard?
-- ════════════════════════════════════════════════════════════════════════════
-- Runs against the LIVE push_tokens rules, as two real members, inside one
-- transaction that ROLLS BACK. Nothing is kept. The tokens are made up
-- ("rehearsal-…"), and only they are counted — except the cap, which counts a
-- member's rows as the rule does.
--
--   psql "$SUPABASE_DB_URL" -X -q -t -A -v with_fix=1 -f mobile/supabase/diagnostics/push_devices_rehearsal.sql
--
-- `with_fix=1` applies 20260929_01 first, inside the same transaction; without
-- it the rules are tested as they stand, which is how the rehearsal shows it can
-- say NO. Read each NOTICE as  case | expected | got.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\if :{?with_fix}
\ir ../../../supabase/migrations/20260929_01_every_device_is_heard.sql
\endif

-- Two members who exist (their writes here are rolled back).
CREATE TEMP TABLE rehearsal_members ON COMMIT DROP AS
  SELECT id, row_number() OVER (ORDER BY created_at) AS n FROM auth.users ORDER BY created_at LIMIT 2;
GRANT SELECT ON rehearsal_members TO authenticated;

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
  RAISE NOTICE '%|%|%', 'a member signs in on an iPhone', 1, mine;

  PERFORM public.register_push_token('ExponentPushToken[rehearsal-A-ipad]', 'ios');
  SELECT count(*) INTO mine FROM public.push_tokens WHERE token LIKE 'ExponentPushToken[rehearsal-%';
  RAISE NOTICE '%|%|%', 'and on an iPad: both are heard', 2, mine;

  PERFORM public.register_push_token('ExponentPushToken[rehearsal-A-pixel]', 'android');
  SELECT count(*) INTO mine FROM public.push_tokens WHERE token LIKE 'ExponentPushToken[rehearsal-%';
  RAISE NOTICE '%|%|%', 'and on an Android phone: all three', 3, mine;

  -- The iPad changes hands: the second member signs in on it.
  PERFORM set_config('request.jwt.claims', format(as_member, b), true);
  PERFORM public.register_push_token('ExponentPushToken[rehearsal-A-ipad]', 'ios');
  SELECT count(*) INTO mine FROM public.push_tokens WHERE token = 'ExponentPushToken[rehearsal-A-ipad]';
  RAISE NOTICE '%|%|%', 'a device that changes hands is the new member''s', 1, mine;

  PERFORM set_config('request.jwt.claims', format(as_member, a), true);
  SELECT count(*) INTO mine FROM public.push_tokens WHERE token LIKE 'ExponentPushToken[rehearsal-%';
  RAISE NOTICE '%|%|%', 'and no longer the old member''s (the old member keeps the rest)', 2, mine;

  -- Signing out of the iPhone removes the iPhone's token alone (the app's path).
  DELETE FROM public.push_tokens WHERE user_id = a AND token = 'ExponentPushToken[rehearsal-A-iphone]';
  SELECT count(*) INTO mine FROM public.push_tokens WHERE token LIKE 'ExponentPushToken[rehearsal-%';
  RAISE NOTICE '%|%|%', 'signing out of one device leaves the others', 1, mine;

  -- Twelve reinstalls later: the member's ten most recent devices, no more.
  FOR i IN 1..12 LOOP
    PERFORM public.register_push_token(format('ExponentPushToken[rehearsal-A-reinstall-%s]', i), 'ios');
  END LOOP;
  SELECT count(*) INTO mine FROM public.push_tokens;   -- every row this member can see: their own
  RAISE NOTICE '%|%|%', 'a member''s devices are capped at ten', 10, mine;
  SELECT count(*) INTO mine FROM public.push_tokens WHERE token = 'ExponentPushToken[rehearsal-A-reinstall-12]';
  RAISE NOTICE '%|%|%', 'and the newest is one of them', 1, mine;
END $$;
ROLLBACK;
