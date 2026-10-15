-- ════════════════════════════════════════════════════════════════════════════
-- a_report_is_counted_once_rehearsal.sql — 20261001_03. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   psql "$SUPABASE_DB_URL" -X -q -t -A -f mobile/supabase/diagnostics/a_report_is_counted_once_rehearsal.sql
--
-- A member's second report of the same thing is refused, nobody writes the
-- table directly, and the docket counts members, not reports. Each case runs
-- as a signed-in member (role authenticated, their JWT claims), inside its own
-- block, so a refusal is caught and recorded, never fatal. Production runs it
-- by hand; db-integration.yml runs it on the sealed copy
-- (e2e/db/rehearsals.mjs). Read each NOTICE as  case|expected|got ; the last
-- line is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

-- Two members, an admin (the first member is made one if the house has none), and a thing nobody has reported.
SELECT set_config('rehearsal.a', pg_temp.rh_found('a member in good standing',
  (SELECT id FROM public.profiles WHERE NOT coalesce(is_banned, false) ORDER BY created_at LIMIT 1))::text, true) AS done \gset rh_
SELECT set_config('rehearsal.b', pg_temp.rh_found('a second member in good standing',
  (SELECT id FROM public.profiles WHERE NOT coalesce(is_banned, false) AND id::text <> current_setting('rehearsal.a') ORDER BY created_at LIMIT 1))::text, true) AS done \gset rh_
SELECT set_config('rehearsal.admin', pg_temp.rh_found('a member to act as the admin', coalesce(
  (SELECT id FROM public.profiles WHERE role = 'admin' ORDER BY created_at LIMIT 1),
  (SELECT id FROM public.profiles ORDER BY created_at LIMIT 1)))::text, true) AS done \gset rh_
UPDATE public.profiles SET role = 'admin' WHERE id = current_setting('rehearsal.admin')::uuid AND role IS DISTINCT FROM 'admin';
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
  PERFORM pg_temp.rh_case('a member files a report', 'ok', got);

  BEGIN
    PERFORM public.submit_report(auth.uid(), thing, 'dispatch_post', 'harassment', NULL, NULL);
    got := 'ok';
  EXCEPTION WHEN OTHERS THEN got := SQLSTATE || ' ' || SQLERRM; END;
  PERFORM pg_temp.rh_case('the same member, the same thing, again', '23505 Already reported', got);

  BEGIN
    INSERT INTO public.reports (reporter_id, content_id, content_type, reason)
    VALUES (auth.uid(), thing::text, 'dispatch_post', 'spam');
    got := 'ok';
  EXCEPTION WHEN OTHERS THEN got := SQLSTATE; END;
  PERFORM pg_temp.rh_case('a member writes the table directly', '42501', got);

  BEGIN
    INSERT INTO public.reports (reporter_id, content_id, content_type, reason, status, resolved_by, resolution)
    VALUES (auth.uid(), gen_random_uuid()::text, 'dispatch_post', 'spam', 'resolved', auth.uid(), 'dismissed');
    got := 'ok';
  EXCEPTION WHEN OTHERS THEN got := SQLSTATE; END;
  PERFORM pg_temp.rh_case('a member writes a report already resolved, by themselves', '42501', got);

  BEGIN
    UPDATE public.reports SET details = 'rehearsal' WHERE reporter_id = auth.uid();
    got := 'ok';
  EXCEPTION WHEN OTHERS THEN got := SQLSTATE; END;
  PERFORM pg_temp.rh_case('a member edits their own report', '42501', got);
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
  PERFORM pg_temp.rh_case('another member reports the same thing', 'ok', got);
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
  PERFORM pg_temp.rh_case('a visitor writes the table directly', '42501', got);
END $$;
RESET ROLE;

-- ── what the docket counts (as postgres, so it reads every row) ─────────────
DO $$
DECLARE got text; thing text := current_setting('rehearsal.thing');
BEGIN
  SELECT count(*)::text INTO got FROM public.reports WHERE content_id = thing AND status = 'pending';
  PERFORM pg_temp.rh_case('the thing holds one pending report per member', '2', got);
  SELECT count(DISTINCT reporter_id)::text INTO got FROM public.reports WHERE content_id = thing AND status = 'pending';
  PERFORM pg_temp.rh_case('and the count is of members', '2', got);

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
  PERFORM pg_temp.rh_case('once it is resolved, the member may report it again', 'ok', got);

  BEGIN
    PERFORM public.submit_report(auth.uid(), auth.uid(), 'profile', 'spam', NULL, auth.uid());
    got := 'ok';
  EXCEPTION WHEN OTHERS THEN got := SQLERRM; END;
  PERFORM pg_temp.rh_case('a member still cannot report their own profile', 'Cannot report your own profile', got);
END $$;
RESET ROLE;

-- ── the docket, as the Tribunal reads it ────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('rehearsal.admin'), 'role', 'authenticated')::text, true) AS done \gset rh_
DO $$ BEGIN
  PERFORM pg_temp.rh_case('the docket ranks the thing by members', '2',
    (SELECT max(report_count)::text FROM public.get_priority_reports(100) WHERE content_id = current_setting('rehearsal.thing')));
END $$;
RESET ROLE;

SELECT pg_temp.rh_verdict();
ROLLBACK;
