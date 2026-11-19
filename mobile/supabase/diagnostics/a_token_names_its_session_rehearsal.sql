-- ════════════════════════════════════════════════════════════════════════════
-- a_token_names_its_session_rehearsal.sql — 20261119_01. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_token_names_its_session_rehearsal.sql --with-train
--
-- The train applies 20261119_01 here (with_train), 20261119_00 already applied; a sealed copy already holds it.
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
-- 20261119_01 is applied on production (the train of 2026-11-19); this shows it still holds there.

-- ── B1.column ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
UPDATE public.interactions SET created_at = created_at - interval '1 hour'
 WHERE user_id IN (SELECT id FROM rehearsal_members) AND created_at = now();
-- ── B1's column rehearsal · the tokens gain an empty column and are registered as before (review round 13) ──
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train, with its
-- rehearsal_members (n = 1..4). The column is there, a uuid, empty for every token already
-- registered; a member registers a device as themselves, as before.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 1), 'role', 'authenticated')::text, true) AS done \gset rh_
SELECT public.register_push_token('rh-b1c-token', 'ios') AS done \gset rh_
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

DO $$ BEGIN
  PERFORM pg_temp.rh_case('a token names the session it was registered under, a uuid that may be empty', 'uuid|YES',
    (SELECT data_type || '|' || is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'push_tokens' AND column_name = 'session_id'));
  PERFORM pg_temp.rh_case('a member still registers a device as themselves', '1',
    (SELECT count(*)::text FROM public.push_tokens
      WHERE token = 'rh-b1c-token' AND user_id = (SELECT id FROM rehearsal_members WHERE n = 1)));
END $$;

SELECT pg_temp.rh_verdict();
ROLLBACK;
