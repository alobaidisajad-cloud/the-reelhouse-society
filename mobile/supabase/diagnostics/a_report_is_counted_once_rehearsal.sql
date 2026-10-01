-- ════════════════════════════════════════════════════════════════════════════
-- Rehearsal — 20261001_03, a report is counted once. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   psql "$SUPABASE_DB_URL" -X -q -t -A -v with_fix=1 -f mobile/supabase/diagnostics/a_report_is_counted_once_rehearsal.sql
--
-- Every case prints "case|expected|got". Without with_fix it shows the house
-- as it is: a second report counts, and a member may write the table directly.
-- Each case runs as a signed-in member (role authenticated, their JWT claims),
-- inside its own block, so a refusal is caught and printed, never fatal.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\if :{?with_fix}
\ir ../../../supabase/migrations/20261001_03_a_report_is_counted_once.sql
\endif

-- Two members, an admin if the house has one, and a thing nobody has reported.
SELECT set_config('rehearsal.a', (SELECT id::text FROM public.profiles WHERE NOT coalesce(is_banned, false) ORDER BY created_at LIMIT 1), true) AS done \gset rh_
SELECT set_config('rehearsal.b', (SELECT id::text FROM public.profiles WHERE NOT coalesce(is_banned, false) AND id::text <> current_setting('rehearsal.a') ORDER BY created_at LIMIT 1), true) AS done \gset rh_
SELECT set_config('rehearsal.admin', coalesce((SELECT id::text FROM public.profiles WHERE role = 'admin' ORDER BY created_at LIMIT 1), ''), true) AS done \gset rh_
SELECT set_config('rehearsal.thing', gen_random_uuid()::text, true) AS done \gset rh_

-- ── member A ────────────────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('rehearsal.a'), 'role', 'authenticated')::text, true) AS done \gset rh_
DO $$
DECLARE got text; thing uuid := current_setting('rehearsal.thing')::uuid;
BEGIN
  BEGIN
    PERFORM public.submit_report(auth.uid(), thing, 'dispatch_post', 'spam', NULL, NULL);
    got := 'ok';
  EXCEPTION WHEN OTHERS THEN got := SQLSTATE; END;
  RAISE NOTICE '%|%|%', 'a member files a report', 'ok', got;

  BEGIN
    PERFORM public.submit_report(auth.uid(), thing, 'dispatch_post', 'harassment', NULL, NULL);
    got := 'ok';
  EXCEPTION WHEN OTHERS THEN got := SQLSTATE || ' ' || SQLERRM; END;
  RAISE NOTICE '%|%|%', 'the same member, the same thing, again', '23505 Already reported', got;

  BEGIN
    INSERT INTO public.reports (reporter_id, content_id, content_type, reason)
    VALUES (auth.uid(), thing::text, 'dispatch_post', 'spam');
    got := 'ok';
  EXCEPTION WHEN OTHERS THEN got := SQLSTATE; END;
  RAISE NOTICE '%|%|%', 'a member writes the table directly', '42501', got;

  BEGIN
    INSERT INTO public.reports (reporter_id, content_id, content_type, reason, status, resolved_by, resolution)
    VALUES (auth.uid(), gen_random_uuid()::text, 'dispatch_post', 'spam', 'resolved', auth.uid(), 'dismissed');
    got := 'ok';
  EXCEPTION WHEN OTHERS THEN got := SQLSTATE; END;
  RAISE NOTICE '%|%|%', 'a member writes a report already resolved, by themselves', '42501', got;

  BEGIN
    UPDATE public.reports SET details = 'rehearsal' WHERE reporter_id = auth.uid();
    got := 'ok';
  EXCEPTION WHEN OTHERS THEN got := SQLSTATE; END;
  RAISE NOTICE '%|%|%', 'a member edits their own report', '42501', got;
END $$;
RESET ROLE;

-- ── member B, the same thing ────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('rehearsal.b'), 'role', 'authenticated')::text, true) AS done \gset rh_
DO $$
DECLARE got text;
BEGIN
  BEGIN
    PERFORM public.submit_report(auth.uid(), current_setting('rehearsal.thing')::uuid, 'dispatch_post', 'spam', NULL, NULL);
    got := 'ok';
  EXCEPTION WHEN OTHERS THEN got := SQLSTATE; END;
  RAISE NOTICE '%|%|%', 'another member reports the same thing', 'ok', got;
END $$;
RESET ROLE;

-- ── a visitor ───────────────────────────────────────────────────────────────
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true) AS done \gset rh_
DO $$
DECLARE got text;
BEGIN
  BEGIN
    INSERT INTO public.reports (content_id, content_type, reason) VALUES (gen_random_uuid()::text, 'profile', 'spam');
    got := 'ok';
  EXCEPTION WHEN OTHERS THEN got := SQLSTATE; END;
  RAISE NOTICE '%|%|%', 'a visitor writes the table directly', '42501', got;
END $$;
RESET ROLE;

-- ── what the docket counts (as postgres, so it reads every row) ─────────────
DO $$
DECLARE got text; thing text := current_setting('rehearsal.thing');
BEGIN
  SELECT count(*)::text INTO got FROM public.reports WHERE content_id = thing AND status = 'pending';
  RAISE NOTICE '%|%|%', 'the thing holds one pending report per member', '2', got;
  SELECT count(DISTINCT reporter_id)::text INTO got FROM public.reports WHERE content_id = thing AND status = 'pending';
  RAISE NOTICE '%|%|%', 'and the count is of members', '2', got;

  -- Resolved, the first member may report it again.
  UPDATE public.reports SET status = 'resolved' WHERE content_id = thing AND reporter_id::text = current_setting('rehearsal.a');
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('rehearsal.a'), 'role', 'authenticated')::text, true) AS done \gset rh_
DO $$
DECLARE got text;
BEGIN
  BEGIN
    PERFORM public.submit_report(auth.uid(), current_setting('rehearsal.thing')::uuid, 'dispatch_post', 'spam', NULL, NULL);
    got := 'ok';
  EXCEPTION WHEN OTHERS THEN got := SQLSTATE; END;
  RAISE NOTICE '%|%|%', 'once it is resolved, the member may report it again', 'ok', got;

  BEGIN
    PERFORM public.submit_report(auth.uid(), auth.uid(), 'profile', 'spam', NULL, auth.uid());
    got := 'ok';
  EXCEPTION WHEN OTHERS THEN got := SQLERRM; END;
  RAISE NOTICE '%|%|%', 'a member still cannot report their own profile', 'Cannot report your own profile', got;
END $$;
RESET ROLE;

-- ── the docket, as the Tribunal reads it ────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', nullif(current_setting('rehearsal.admin'), ''), 'role', 'authenticated')::text, true) AS done \gset rh_
DO $$
DECLARE got text;
BEGIN
  IF current_setting('rehearsal.admin') = '' THEN
    RAISE NOTICE '%|%|%', 'the docket ranks the thing by members (no admin to read it)', 'skipped', 'skipped';
    RETURN;
  END IF;
  SELECT max(report_count)::text INTO got FROM public.get_priority_reports(100) WHERE content_id = current_setting('rehearsal.thing');
  RAISE NOTICE '%|%|%', 'the docket ranks the thing by members', '2', got;
END $$;
RESET ROLE;

ROLLBACK;
