-- ════════════════════════════════════════════════════════════════════════════
-- a_push_is_sent_once_rehearsal.sql — 20261111_01. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_push_is_sent_once_rehearsal.sql --with-train
--
-- 20261111_01 is applied on production (2026-11-11); this shows it still holds there.
-- A notice is written for a member as the house writes one: it waits to be pushed (no pushed_at).
-- The member marks it read, as every client does, and tries to mark it pushed too: it is read, and
-- still waits. notify-push's claim (the service role, while the notice is fresh) takes it once: a
-- second claim takes nothing. Read each NOTICE as case|expected|got ; the last line is the verdict,
-- and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

-- As the house: claims cleared, so no member's gate judges the setup.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
SELECT set_config('rehearsal.member', pg_temp.rh_found('a member to tell',
  (SELECT id FROM public.profiles WHERE role IS DISTINCT FROM 'admin' ORDER BY id LIMIT 1))::text, true) AS done \gset rh_
CREATE TEMP TABLE rh_notice (id uuid) ON COMMIT DROP;
WITH n AS (
  INSERT INTO public.notifications (user_id, type, message)
  VALUES (current_setting('rehearsal.member')::uuid, 'system', 'A notice the rehearsal pushes.')
  RETURNING id)
INSERT INTO rh_notice SELECT id FROM n;
GRANT SELECT ON rh_notice TO authenticated, service_role;

CREATE TEMP TABLE rh_got (what text PRIMARY KEY, got text) ON COMMIT DROP;
GRANT ALL ON rh_got TO authenticated, service_role;
INSERT INTO rh_got SELECT 'written', coalesce(pushed_at::text, 'waiting') FROM public.notifications WHERE id = (SELECT id FROM rh_notice);

-- The member marks it read, and pushed: the read lands, the push is the house's.
CREATE FUNCTION pg_temp.rh_member_marks() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', current_setting('rehearsal.member'), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  BEGIN
    UPDATE public.notifications SET is_read = true, pushed_at = now() WHERE id = (SELECT id FROM rh_notice);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO rh_got VALUES ('the member refused', SQLERRM);
  END;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
END $$;
SELECT pg_temp.rh_member_marks() AS done \gset rh_
INSERT INTO rh_got SELECT 'marked by the member', is_read::text || '|' || coalesce(pushed_at::text, 'waiting')
  FROM public.notifications WHERE id = (SELECT id FROM rh_notice);

-- notify-push's claim, as the service role: once, while fresh.
CREATE FUNCTION pg_temp.rh_claim() RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  PERFORM set_config('role', 'service_role', true);
  UPDATE public.notifications SET pushed_at = now()
   WHERE id = (SELECT id FROM rh_notice) AND pushed_at IS NULL AND created_at >= now() - interval '15 minutes';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM set_config('role', 'none', true);
  RETURN n;
END $$;
INSERT INTO rh_got SELECT 'the first claim', pg_temp.rh_claim()::text;
INSERT INTO rh_got SELECT 'the second claim', pg_temp.rh_claim()::text;

-- ── the verdict ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM pg_temp.rh_case('a notice written waits to be pushed', 'waiting', (SELECT got FROM rh_got WHERE what = 'written'));
  PERFORM pg_temp.rh_case('the member''s update is not refused', 'none', coalesce((SELECT got FROM rh_got WHERE what = 'the member refused'), 'none'));
  PERFORM pg_temp.rh_case('the member marks it read; its push stays the house''s', 'true|waiting', (SELECT got FROM rh_got WHERE what = 'marked by the member'));
  PERFORM pg_temp.rh_case('notify-push claims a fresh notice', '1', (SELECT got FROM rh_got WHERE what = 'the first claim'));
  PERFORM pg_temp.rh_case('and only once', '0', (SELECT got FROM rh_got WHERE what = 'the second claim'));
END $$;

SELECT pg_temp.rh_verdict();
ROLLBACK;
