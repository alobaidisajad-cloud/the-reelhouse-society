-- security.sql — production's row rules, asked as visitors and members.
--
-- Run by db-integration.yml against the database bootstrap.mjs builds from the
-- snapshot (supabase/schema/live-*.sql), so every policy, grant, function and
-- trigger asked here is production's own; nothing is defined in this file.
--
-- One transaction, rolled back at the end. Each case is its own SAVEPOINT, asked
-- as a visitor (anon) or a member (authenticated, with request.jwt.claims naming
-- them, as PostgREST sets it). A case that fails RAISEs, and ON_ERROR_STOP turns
-- that into a red run. Each refusal has a control beside it that is allowed, so
-- a rule that refuses everything does not pass as one that refuses the right thing.
--
--   psql "postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres" -X -q -f e2e/db/security.sql

\set ON_ERROR_STOP 1
BEGIN;

-- ── the house ─────────────────────────────────────────────────────────────────
-- alice public · bob private · carol follows bob · dave a stranger · erin, whom
-- alice blocked · and a log whose author has no profile. Laid down with triggers
-- off, as e2e/load/seed.sql does: the rows are the setting, the rules are asked.
SET LOCAL session_replication_role = replica;

INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at, email_confirmed_at)
SELECT id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       name || '@security.test', jsonb_build_object('username', 'sec_' || name), '{"provider":"email"}'::jsonb, now(), now(), now()
  FROM (VALUES ('a11ce000-0000-4000-8000-000000000001', 'alice'), ('b0b00000-0000-4000-8000-000000000002', 'bob'),
               ('ca201000-0000-4000-8000-000000000003', 'carol'), ('da7e0000-0000-4000-8000-000000000004', 'dave'),
               ('e2100000-0000-4000-8000-000000000005', 'erin')) m(id, name);

INSERT INTO public.profiles (id, username, email, is_social_private, preferences)
SELECT id, 'sec_' || split_part(email, '@', 1), email, email = 'bob@security.test', '{}'::jsonb
  FROM auth.users WHERE email LIKE '%@security.test';

INSERT INTO public.logs (id, user_id, film_id, film_title, watched_date, review) VALUES
  ('a11ce000-0000-4000-8000-0000000000a1', 'a11ce000-0000-4000-8000-000000000001', 680, 'Pulp Fiction', '2026-01-01', 'alice, in public'),
  ('b0b00000-0000-4000-8000-0000000000b1', 'b0b00000-0000-4000-8000-000000000002', 680, 'Pulp Fiction', '2026-01-01', 'bob, in private'),
  ('dead0000-0000-4000-8000-0000000000f1', 'dead0000-0000-4000-8000-00000000dead', 680, 'Pulp Fiction', '2026-01-01', 'a writer with no profile');

INSERT INTO public.interactions (user_id, target_user_id, type) VALUES
  ('ca201000-0000-4000-8000-000000000003', 'b0b00000-0000-4000-8000-000000000002', 'follow');

INSERT INTO public.user_blocks (blocker_id, blocked_id, type) VALUES
  ('a11ce000-0000-4000-8000-000000000001', 'e2100000-0000-4000-8000-000000000005', 'block');

-- Notices: to alice from erin (blocked) and from dave; to erin from alice (who blocked
-- her) and from dave.
INSERT INTO public.notifications (id, user_id, from_user_id, type, message) VALUES
  ('a11ce000-0000-4000-8000-0000000000e1', 'a11ce000-0000-4000-8000-000000000001', 'e2100000-0000-4000-8000-000000000005', 'follow', 'is following you.'),
  ('a11ce000-0000-4000-8000-0000000000d1', 'a11ce000-0000-4000-8000-000000000001', 'da7e0000-0000-4000-8000-000000000004', 'follow', 'is following you.'),
  ('e2100000-0000-4000-8000-0000000000a1', 'e2100000-0000-4000-8000-000000000005', 'a11ce000-0000-4000-8000-000000000001', 'follow', 'is following you.'),
  ('e2100000-0000-4000-8000-0000000000d1', 'e2100000-0000-4000-8000-000000000005', 'da7e0000-0000-4000-8000-000000000004', 'follow', 'is following you.');

SET LOCAL session_replication_role = origin;

-- ── a visitor ─────────────────────────────────────────────────────────────────
SAVEPOINT c;
SET LOCAL ROLE anon;
SET LOCAL request.jwt.claims = '{"role":"anon"}';
DO $$ DECLARE n bigint; BEGIN
  n := (SELECT count(*) FROM public.logs WHERE user_id = 'a11ce000-0000-4000-8000-000000000001');
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: a visitor cannot see a public member''s log (got %)', n; END IF;
  n := (SELECT count(*) FROM public.logs WHERE user_id = 'b0b00000-0000-4000-8000-000000000002');
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: a visitor can see a private member''s log (got %)', n; END IF;
  n := (SELECT count(*) FROM public.logs WHERE id = 'dead0000-0000-4000-8000-0000000000f1');
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: a visitor can see a log whose author has no profile (got %)', n; END IF;
  IF public.can_view_user_data('dead0000-0000-4000-8000-00000000dead') THEN
    RAISE EXCEPTION 'FAIL: can_view_user_data says a missing profile is viewable';
  END IF;
  IF NOT public.can_view_user_data('a11ce000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'FAIL: can_view_user_data says a public member is not viewable';
  END IF;
  BEGIN
    PERFORM count(*) FROM public.notifications;
    RAISE EXCEPTION 'FAIL: a visitor can read notifications';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'PASS: a visitor sees a public log, not a private one, not one with no profile, and no notice';
END $$;
ROLLBACK TO SAVEPOINT c;
RELEASE SAVEPOINT c;

-- ── who may read a private member's log ───────────────────────────────────────
SAVEPOINT c;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"da7e0000-0000-4000-8000-000000000004","role":"authenticated"}';
DO $$ DECLARE n bigint; BEGIN
  n := (SELECT count(*) FROM public.logs WHERE user_id = 'b0b00000-0000-4000-8000-000000000002');
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: a stranger can see a private member''s log (got %)', n; END IF;
  n := (SELECT count(*) FROM public.logs WHERE id = 'dead0000-0000-4000-8000-0000000000f1');
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: a member can see a log whose author has no profile (got %)', n; END IF;
  IF public.can_view_user_data('dead0000-0000-4000-8000-00000000dead') THEN
    RAISE EXCEPTION 'FAIL: can_view_user_data says a missing profile is viewable, to a member';
  END IF;
  RAISE NOTICE 'PASS: a stranger cannot see a private log, nor one with no profile';
END $$;
ROLLBACK TO SAVEPOINT c;
RELEASE SAVEPOINT c;

SAVEPOINT c;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"ca201000-0000-4000-8000-000000000003","role":"authenticated"}';
DO $$ DECLARE n bigint; BEGIN
  n := (SELECT count(*) FROM public.logs WHERE user_id = 'b0b00000-0000-4000-8000-000000000002');
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: a follower cannot see a private member''s log (got %)', n; END IF;
  RAISE NOTICE 'PASS: a follower sees a private member''s log';
END $$;
ROLLBACK TO SAVEPOINT c;
RELEASE SAVEPOINT c;

SAVEPOINT c;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"b0b00000-0000-4000-8000-000000000002","role":"authenticated"}';
DO $$ DECLARE n bigint; BEGIN
  n := (SELECT count(*) FROM public.logs WHERE user_id = 'b0b00000-0000-4000-8000-000000000002');
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: a private member cannot see their own log (got %)', n; END IF;
  RAISE NOTICE 'PASS: a private member sees their own log';
END $$;
ROLLBACK TO SAVEPOINT c;
RELEASE SAVEPOINT c;

-- A follow aimed at a private member becomes a request (tr_enforce_privacy_on_follow),
-- and a request opens nothing.
SAVEPOINT c;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"da7e0000-0000-4000-8000-000000000004","role":"authenticated"}';
DO $$ DECLARE t text; n bigint; BEGIN
  INSERT INTO public.interactions (user_id, target_user_id, type)
  VALUES ('da7e0000-0000-4000-8000-000000000004', 'b0b00000-0000-4000-8000-000000000002', 'follow')
  RETURNING type INTO t;
  IF t <> 'follow_request' THEN RAISE EXCEPTION 'FAIL: a follow of a private member was kept as %', t; END IF;
  n := (SELECT count(*) FROM public.logs WHERE user_id = 'b0b00000-0000-4000-8000-000000000002');
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: asking to follow opened a private member''s log (got %)', n; END IF;
  RAISE NOTICE 'PASS: following a private member is a request, and the log stays closed';
END $$;
ROLLBACK TO SAVEPOINT c;
RELEASE SAVEPOINT c;

-- ── no member writes in another's name ────────────────────────────────────────
SAVEPOINT c;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"da7e0000-0000-4000-8000-000000000004","role":"authenticated"}';
DO $$ DECLARE n bigint; BEGIN
  WITH u AS (UPDATE public.logs SET review = 'defaced' WHERE id = 'a11ce000-0000-4000-8000-0000000000a1' RETURNING 1)
  SELECT count(*) INTO n FROM u;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: a member rewrote another member''s log'; END IF;
  WITH d AS (DELETE FROM public.logs WHERE id = 'a11ce000-0000-4000-8000-0000000000a1' RETURNING 1)
  SELECT count(*) INTO n FROM d;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: a member deleted another member''s log'; END IF;
  BEGIN
    INSERT INTO public.logs (user_id, film_id, film_title, watched_date)
    VALUES ('a11ce000-0000-4000-8000-000000000001', 680, 'Pulp Fiction', '2026-01-02');
    RAISE EXCEPTION 'FAIL: a member wrote a log in another member''s name';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'PASS: a member cannot rewrite, delete or forge another member''s log';
END $$;
ROLLBACK TO SAVEPOINT c;
RELEASE SAVEPOINT c;

SAVEPOINT c;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a11ce000-0000-4000-8000-000000000001","role":"authenticated"}';
DO $$ DECLARE n bigint; BEGIN
  WITH u AS (UPDATE public.logs SET review = 'rewritten by its writer' WHERE id = 'a11ce000-0000-4000-8000-0000000000a1' RETURNING 1)
  SELECT count(*) INTO n FROM u;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: a member cannot rewrite their own log (control, got %)', n; END IF;
  RAISE NOTICE 'PASS: a member rewrites their own log (the control)';
END $$;
ROLLBACK TO SAVEPOINT c;
RELEASE SAVEPOINT c;

SAVEPOINT c;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"ca201000-0000-4000-8000-000000000003","role":"authenticated"}';
DO $$ DECLARE n bigint; BEGIN
  BEGIN
    INSERT INTO public.notifications (user_id, from_user_id, type, message)
    VALUES ('a11ce000-0000-4000-8000-000000000001', 'ca201000-0000-4000-8000-000000000003', 'follow', 'spoofed');
    RAISE EXCEPTION 'FAIL: a member sent a notification of their own making';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  WITH u AS (UPDATE public.notifications SET is_read = true WHERE id = 'a11ce000-0000-4000-8000-0000000000d1' RETURNING 1)
  SELECT count(*) INTO n FROM u;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: a member marked another member''s notice'; END IF;
  WITH d AS (DELETE FROM public.notifications WHERE id = 'a11ce000-0000-4000-8000-0000000000d1' RETURNING 1)
  SELECT count(*) INTO n FROM d;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: a member deleted another member''s notice'; END IF;
  RAISE NOTICE 'PASS: a member cannot send, mark or delete another member''s notice';
END $$;
ROLLBACK TO SAVEPOINT c;
RELEASE SAVEPOINT c;

-- ── a blocked author is not heard ─────────────────────────────────────────────
SAVEPOINT c;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a11ce000-0000-4000-8000-000000000001","role":"authenticated"}';
DO $$ DECLARE n bigint; BEGIN
  n := (SELECT count(*) FROM public.notifications WHERE from_user_id = 'e2100000-0000-4000-8000-000000000005');
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: a member sees a notice from someone they blocked (got %)', n; END IF;
  n := (SELECT count(*) FROM public.notifications WHERE from_user_id = 'da7e0000-0000-4000-8000-000000000004');
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: a member cannot see a notice from someone unblocked (control, got %)', n; END IF;
  WITH u AS (UPDATE public.notifications SET is_read = true WHERE id = 'a11ce000-0000-4000-8000-0000000000d1' RETURNING 1)
  SELECT count(*) INTO n FROM u;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: a member cannot mark their own notice (control, got %)', n; END IF;
  RAISE NOTICE 'PASS: the blocker does not hear the blocked; their own notices are theirs';
END $$;
ROLLBACK TO SAVEPOINT c;
RELEASE SAVEPOINT c;

SAVEPOINT c;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"e2100000-0000-4000-8000-000000000005","role":"authenticated"}';
DO $$ DECLARE n bigint; BEGIN
  n := (SELECT count(*) FROM public.notifications WHERE from_user_id = 'a11ce000-0000-4000-8000-000000000001');
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: a blocked member sees a notice from the one who blocked them (got %)', n; END IF;
  n := (SELECT count(*) FROM public.notifications WHERE from_user_id = 'da7e0000-0000-4000-8000-000000000004');
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: a blocked member cannot see a notice from anyone else (control, got %)', n; END IF;
  RAISE NOTICE 'PASS: the blocked do not hear the blocker either';
END $$;
ROLLBACK TO SAVEPOINT c;
RELEASE SAVEPOINT c;

ROLLBACK;
\echo '✓ production''s row rules hold for visitors and members'
