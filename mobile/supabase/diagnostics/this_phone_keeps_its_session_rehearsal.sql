-- ════════════════════════════════════════════════════════════════════════════
-- this_phone_keeps_its_session_rehearsal.sql — 20261119_14. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs this_phone_keeps_its_session_rehearsal.sql --with-train
--
-- The train applies 20261119_14 here (with_train), 20261119_00 to 20261119_13 already applied; a sealed copy already holds it.
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
CREATE TEMP TABLE b11_seen (what text PRIMARY KEY, got text) ON COMMIT DROP;
GRANT ALL ON b11_seen TO authenticated;
CREATE TEMP TABLE b11_s (session uuid) ON COMMIT DROP;
GRANT SELECT ON b11_s TO authenticated;

-- The train applies it here first (with_train), on production as the cars before it left it; a sealed
-- copy already holds every pending migration.
\if :{?with_train}
\ir ../../../supabase/migrations/20261119_14_this_phone_keeps_its_session.sql
\endif

-- ── B11 ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.interaction_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interaction_churn WHERE user_id IN (SELECT id FROM rehearsal_members);
-- ── B11 rehearsal · signing out every other device ties this phone's token to its session (review round 13) ──
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train (B1, B8 and B11
-- applied), with its rehearsal_members (n = 1..4); every row is undone with the transaction.
-- Member 1 holds two tokens from before round 13 (no session): this phone's and another's. As
-- themselves, under a session of theirs, they sign out every other device naming this phone's token:
-- the other phone's token goes, and this phone's row now names this session.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
INSERT INTO b11_s VALUES (gen_random_uuid());
INSERT INTO public.push_tokens (user_id, token, platform)
VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), 'rh-b11-this-phone', 'ios'),
       ((SELECT id FROM rehearsal_members WHERE n = 1), 'rh-b11-sold-phone', 'android');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 1), 'role', 'authenticated',
  'session_id', (SELECT session FROM b11_s))::text, true) AS done \gset rh_
INSERT INTO b11_seen VALUES ('forgotten', public.forget_other_devices('rh-b11-this-phone')::text);
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

DO $$ BEGIN
  PERFORM pg_temp.rh_case('the other phone''s token goes', '0',
    (SELECT count(*)::text FROM public.push_tokens WHERE token = 'rh-b11-sold-phone'));
  PERFORM pg_temp.rh_case('this phone''s token stays, now tied to the session it was asked from', 'true',
    coalesce((SELECT (session_id = (SELECT session FROM b11_s))::text FROM public.push_tokens WHERE token = 'rh-b11-this-phone'), 'missing'));
END $$;

SELECT pg_temp.rh_verdict();
ROLLBACK;
