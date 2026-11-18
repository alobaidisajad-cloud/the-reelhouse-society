-- ════════════════════════════════════════════════════════════════════════════
-- an_old_token_follows_the_session_that_made_it_rehearsal.sql — 20261119_13. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs an_old_token_follows_the_session_that_made_it_rehearsal.sql --with-train
--
-- The train applies 20261119_13 here (with_train), 20261119_00 to 20261119_12 already applied; a sealed copy already holds it.
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
CREATE TEMP TABLE b8_m (member uuid, session uuid) ON COMMIT DROP;
GRANT SELECT ON b8_m TO service_role;
CREATE TEMP TABLE b8_seen (what text PRIMARY KEY, got text) ON COMMIT DROP;
GRANT ALL ON b8_seen TO service_role;

-- The train applies it here first (with_train), on production as the cars before it left it; a sealed
-- copy already holds every pending migration.
\if :{?with_train}
\ir ../../../supabase/migrations/20261119_13_an_old_token_follows_the_session_that_made_it.sql
\endif

-- ── B8 ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.interaction_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interaction_churn WHERE user_id IN (SELECT id FROM rehearsal_members);
-- ── B8 rehearsal · a token with no session is sent to only while a session that could have registered it stands, and never past a month unregistered (review round 13) ──
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train (B1 and B8
-- applied), with its rehearsal_members (n = 1..4); every row is undone with the transaction.
-- A member with a session standing that was made over 40 days ago and that no phone's token is
-- registered under yet (one of the house's, read; on a copy with none, one is laid for rehearsal
-- member 1). Tokens from before round 13 (no session) are laid by the house as that member's. Then:
--   a token registered a day ago is sent to: that old session could have registered it, and no other
--   phone has claimed it;
--   a token not registered for 35 days goes, though that session still stands: a phone signed in
--   registers each time it is opened;
--   once every session that could have registered the day-old token is claimed by a phone (each
--   phone's token registered under it, as the phones do from round 13 on), it goes: the session that
--   registered it has ended, so its phone is signed out;
--   a token registered under a standing session (round 13's) is sent to, as B1 made it.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

DO $$
DECLARE v_s uuid; v_u uuid;
BEGIN
  SELECT s.id, s.user_id INTO v_s, v_u
    FROM auth.sessions s JOIN public.profiles p ON p.id = s.user_id
   WHERE (s.not_after IS NULL OR s.not_after > now())
     AND s.created_at < now() - interval '40 days'
     AND NOT EXISTS (SELECT 1 FROM public.push_tokens o WHERE o.session_id = s.id)
   ORDER BY s.created_at DESC LIMIT 1;
  IF v_s IS NULL THEN
    -- A copy of the house with no such session (the sealed world, a local copy): one is laid, written
    -- only here, so the house's own run never writes auth.sessions.
    v_u := (SELECT id FROM rehearsal_members WHERE n = 1);
    v_s := gen_random_uuid();
    EXECUTE format('INSERT INTO auth.sessions (id, user_id, created_at, updated_at) VALUES (%L, %L, now() - interval ''60 days'', now() - interval ''60 days'')', v_s, v_u);
  END IF;
  INSERT INTO b8_m VALUES (v_u, v_s);
END $$;
SELECT pg_temp.rh_need('a member with an old session standing', (SELECT count(*) FROM b8_m), 1) AS done \gset rh_

-- Tokens from before round 13, laid as the member's: registered a day ago, and 35 days ago.
INSERT INTO public.push_tokens (user_id, token, platform, updated_at, created_at)
VALUES ((SELECT member FROM b8_m), 'rh-b8-a-day-ago', 'ios', now() - interval '1 day', now() - interval '1 day'),
       ((SELECT member FROM b8_m), 'rh-b8-a-month-ago', 'android', now() - interval '35 days', now() - interval '35 days');

CREATE FUNCTION pg_temp.b8_sent(p_what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', 'service_role', true);
  INSERT INTO b8_seen VALUES (p_what,
    coalesce((SELECT string_agg(t.token, ',' ORDER BY t.token) FROM public.push_tokens_of((SELECT member FROM b8_m)) t
               WHERE t.token LIKE 'rh-b8-%'), ''));
  PERFORM set_config('role', 'none', true);
END $$;

SELECT pg_temp.b8_sent('before any phone claimed a session') AS done \gset rh_
INSERT INTO b8_seen VALUES ('the month-old row', (SELECT count(*)::text FROM public.push_tokens WHERE token = 'rh-b8-a-month-ago'));

-- Every phone registers under its own session from round 13 on: each session of the member that
-- could have registered the day-old token is claimed by a phone's token, the old one among them.
INSERT INTO public.push_tokens (user_id, token, platform, session_id, updated_at)
SELECT (SELECT member FROM b8_m), 'rh-b8-claims-' || s.id::text, 'ios', s.id, now()
  FROM auth.sessions s
 WHERE s.user_id = (SELECT member FROM b8_m)
   AND (s.not_after IS NULL OR s.not_after > now())
   AND s.created_at <= now() - interval '1 day'
   AND NOT EXISTS (SELECT 1 FROM public.push_tokens o WHERE o.session_id = s.id);
SELECT pg_temp.b8_sent('once every such session is a phone''s') AS done \gset rh_
INSERT INTO b8_seen VALUES ('the day-old row', (SELECT count(*)::text FROM public.push_tokens WHERE token = 'rh-b8-a-day-ago'));

DO $$ BEGIN
  PERFORM pg_temp.rh_case('a token from before round 13 is sent to while a session that could have registered it stands, claimed by no phone',
    'rh-b8-a-day-ago', (SELECT got FROM b8_seen WHERE what = 'before any phone claimed a session'));
  PERFORM pg_temp.rh_case('one not registered for 35 days goes, though that session still stands', '0',
    (SELECT got FROM b8_seen WHERE what = 'the month-old row'));
  PERFORM pg_temp.rh_case('once every session that could have registered it is another phone''s, it is not sent to, and the phones are',
    'true', ((SELECT got FROM b8_seen WHERE what = 'once every such session is a phone''s') NOT LIKE '%rh-b8-a-day-ago%'
             AND (SELECT got FROM b8_seen WHERE what = 'once every such session is a phone''s')
                 LIKE '%rh-b8-claims-' || (SELECT session FROM b8_m)::text || '%')::text);
  PERFORM pg_temp.rh_case('and it is gone', '0', (SELECT got FROM b8_seen WHERE what = 'the day-old row'));
END $$;

SELECT pg_temp.rh_verdict();
ROLLBACK;
