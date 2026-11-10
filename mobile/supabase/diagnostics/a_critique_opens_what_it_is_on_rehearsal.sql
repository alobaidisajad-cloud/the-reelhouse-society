-- ════════════════════════════════════════════════════════════════════════════
-- a_critique_opens_what_it_is_on_rehearsal.sql — 20261109_03. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_critique_opens_what_it_is_on_rehearsal.sql
--
-- 20261109_03 is applied on production; this shows it still holds there, and
-- on every sealed copy (db-integration.yml). A member critiques an owner's log
-- and stack as themselves: each notice names its log or its stack. A follow and
-- a Dispatch critique keep what they were written with. (The notices written
-- before were keyed once, by the migration: train_7_live_check.sql reads that
-- none is left.) Read each NOTICE as case|expected|got ; the last line is the
-- verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

-- As the house: claims cleared, so no member's gate judges the setup.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
-- An owner with a log and a stack, and a critic who is neither banned nor them.
SELECT set_config('rehearsal.owner', pg_temp.rh_found('a member with a log and a stack',
  (SELECT l.user_id FROM public.logs l
    WHERE EXISTS (SELECT 1 FROM public.lists s WHERE s.user_id = l.user_id)
    ORDER BY l.user_id LIMIT 1))::text, true) AS done \gset rh_
SELECT set_config('rehearsal.critic', pg_temp.rh_found('a member to critique',
  (SELECT id FROM public.profiles
    WHERE id <> current_setting('rehearsal.owner')::uuid AND username IS NOT NULL
      AND is_banned IS NOT TRUE AND (suspended_until IS NULL OR suspended_until < now())
    ORDER BY id LIMIT 1))::text, true) AS done \gset rh_
SELECT set_config('rehearsal.log', (SELECT id FROM public.logs WHERE user_id = current_setting('rehearsal.owner')::uuid ORDER BY id LIMIT 1)::text, true) AS done \gset rh_
SELECT set_config('rehearsal.list', (SELECT id FROM public.lists WHERE user_id = current_setting('rehearsal.owner')::uuid ORDER BY id LIMIT 1)::text, true) AS done \gset rh_

-- A notice that must stay as it was written: a Dispatch critique's key, a follow's none.
CREATE TEMP TABLE rh_kept (what text PRIMARY KEY, id uuid, key text) ON COMMIT DROP;
WITH n AS (
  INSERT INTO public.notifications (user_id, type, from_username, from_user_id, message, group_key)
  VALUES (current_setting('rehearsal.owner')::uuid, 'comment', 'rh', current_setting('rehearsal.critic')::uuid,
          'left a critique on your log of y.', 'endorse:post:' || gen_random_uuid())
  RETURNING id, group_key)
INSERT INTO rh_kept SELECT 'a Dispatch critique keeps its key', id, group_key FROM n;
WITH n AS (
  INSERT INTO public.notifications (user_id, type, from_username, from_user_id, message)
  VALUES (current_setting('rehearsal.owner')::uuid, 'follow', 'rh', current_setting('rehearsal.critic')::uuid, 'is following you.')
  RETURNING id, group_key)
INSERT INTO rh_kept SELECT 'a follow keeps no key', id, group_key FROM n;

-- ── a member's critiques, as the member ──────────────────────────────────────
CREATE TEMP TABLE rh_new (what text PRIMARY KEY, got text) ON COMMIT DROP;
GRANT ALL ON rh_new TO authenticated;
CREATE FUNCTION pg_temp.rh_critique_as_critic() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', current_setting('rehearsal.critic'), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  BEGIN
    INSERT INTO public.log_comments (log_id, user_id, username, body)
    VALUES (current_setting('rehearsal.log')::uuid, current_setting('rehearsal.critic')::uuid, 'rh', 'a new critique of the log');
    INSERT INTO public.list_comments (list_id, user_id, content)
    VALUES (current_setting('rehearsal.list')::uuid, current_setting('rehearsal.critic')::uuid, 'a new critique of the stack');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO rh_new VALUES ('refused', SQLERRM);
  END;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
END $$;
SELECT pg_temp.rh_critique_as_critic() AS done \gset rh_
INSERT INTO rh_new
SELECT CASE WHEN n.message LIKE 'left a critique on your stack %' THEN 'the stack' ELSE 'the log' END, n.group_key
  FROM public.notifications n
 WHERE n.type = 'comment' AND n.from_user_id = current_setting('rehearsal.critic')::uuid
   AND n.user_id = current_setting('rehearsal.owner')::uuid AND n.created_at = now()
   AND n.id NOT IN (SELECT id FROM rh_kept);

-- ── the verdict ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM pg_temp.rh_case('a member''s critique is written', 'none', coalesce((SELECT got FROM rh_new WHERE what = 'refused'), 'none'));
  PERFORM pg_temp.rh_case('a member''s critique of a log names the log', 'endorse:log:' || current_setting('rehearsal.log'),
    (SELECT got FROM rh_new WHERE what = 'the log'));
  PERFORM pg_temp.rh_case('a member''s critique of a stack names the stack', 'endorse:list:' || current_setting('rehearsal.list'),
    (SELECT got FROM rh_new WHERE what = 'the stack'));
  PERFORM pg_temp.rh_case('a Dispatch critique keeps its key', (SELECT key FROM rh_kept WHERE what = 'a Dispatch critique keeps its key'),
    (SELECT n.group_key FROM public.notifications n JOIN rh_kept k ON k.id = n.id WHERE k.what = 'a Dispatch critique keeps its key'));
  PERFORM pg_temp.rh_case('a follow keeps no key', 'none',
    (SELECT coalesce(n.group_key, 'none') FROM public.notifications n JOIN rh_kept k ON k.id = n.id WHERE k.what = 'a follow keeps no key'));
END $$;

SELECT pg_temp.rh_verdict();
ROLLBACK;
