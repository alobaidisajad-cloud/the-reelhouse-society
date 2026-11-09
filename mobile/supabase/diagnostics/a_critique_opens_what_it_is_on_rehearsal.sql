-- ════════════════════════════════════════════════════════════════════════════
-- a_critique_opens_what_it_is_on_rehearsal.sql — 20261109_03. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_critique_opens_what_it_is_on_rehearsal.sql
--
-- A critique's notice names what it is on. Notices written before are staged
-- first, as the old writers left them (no key) and dated an hour and two apart:
-- two critiques by one critic on two logs of one owner, one on a stack, and one
-- whose critique is gone. Then the migration runs (applied by the train, or run
-- once more on a copy that holds it: its writers replaced as they are, and only
-- keyless notices given a key), and a member critiques a log and a stack as
-- themselves. Each
-- notice must name its own log or stack; the one with no critique keeps no
-- key; a follow and a Dispatch critique keep theirs. Read each NOTICE as
-- case|expected|got ; the last line is the verdict, and any miss makes psql
-- exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

-- As the house: claims cleared, so no member's gate judges the setup.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
-- An owner with two logs and a stack, and a critic who is neither banned nor them.
SELECT set_config('rehearsal.owner', pg_temp.rh_found('a member with two logs and a stack',
  (SELECT l.user_id FROM public.logs l
    WHERE EXISTS (SELECT 1 FROM public.lists s WHERE s.user_id = l.user_id)
    GROUP BY l.user_id HAVING count(*) >= 2 ORDER BY l.user_id LIMIT 1))::text, true) AS done \gset rh_
SELECT set_config('rehearsal.critic', pg_temp.rh_found('a member to critique',
  (SELECT id FROM public.profiles
    WHERE id <> current_setting('rehearsal.owner')::uuid AND username IS NOT NULL
      AND is_banned IS NOT TRUE AND (suspended_until IS NULL OR suspended_until < now())
    ORDER BY id LIMIT 1))::text, true) AS done \gset rh_
SELECT set_config('rehearsal.log1', (SELECT id FROM public.logs WHERE user_id = current_setting('rehearsal.owner')::uuid ORDER BY id LIMIT 1)::text, true) AS done \gset rh_
SELECT set_config('rehearsal.log2', (SELECT id FROM public.logs WHERE user_id = current_setting('rehearsal.owner')::uuid ORDER BY id OFFSET 1 LIMIT 1)::text, true) AS done \gset rh_
SELECT set_config('rehearsal.list', (SELECT id FROM public.lists WHERE user_id = current_setting('rehearsal.owner')::uuid ORDER BY id LIMIT 1)::text, true) AS done \gset rh_

-- ── the notices written before ───────────────────────────────────────────────
-- Each critique written, then its notice set back as the old writer left it: no key, dated with its
-- critique (the old writer's notice shared its critique's transaction, so its now()).
CREATE TEMP TABLE rh_old (what text PRIMARY KEY, at timestamptz, comment_id uuid, notice_id uuid) ON COMMIT DROP;
INSERT INTO rh_old (what, at) VALUES
  ('the first log', now() - interval '2 hours'),
  ('the second log', now() - interval '1 hour'),
  ('the stack', now() - interval '90 minutes'),
  ('a critique since deleted', now() - interval '3 hours');
INSERT INTO public.log_comments (log_id, user_id, username, body, created_at)
SELECT CASE what WHEN 'the second log' THEN current_setting('rehearsal.log2') ELSE current_setting('rehearsal.log1') END::uuid,
       current_setting('rehearsal.critic')::uuid, 'rh', 'an old critique of ' || what, at
  FROM rh_old WHERE what <> 'the stack';
INSERT INTO public.list_comments (list_id, user_id, content, created_at)
SELECT current_setting('rehearsal.list')::uuid, current_setting('rehearsal.critic')::uuid, 'an old critique of the stack', at
  FROM rh_old WHERE what = 'the stack';
UPDATE rh_old o SET comment_id = c.id FROM public.log_comments c WHERE c.body = 'an old critique of ' || o.what;
UPDATE rh_old o SET comment_id = c.id FROM public.list_comments c WHERE c.content = 'an old critique of the stack' AND o.what = 'the stack';
SELECT pg_temp.rh_need('old critiques written', (SELECT count(comment_id) FROM rh_old), 4) AS done \gset rh_
-- The four notices the trigger wrote for them (dated now(), this transaction's), each paired with one
-- critique and set back as the old writer left it: no key, its critique's time, its kind's words. The
-- pairing is free: the migration must find each notice's critique by its critic, owner and time alone.
WITH n AS (
  SELECT id, row_number() OVER (ORDER BY id) AS r FROM public.notifications
   WHERE type = 'comment' AND from_user_id = current_setting('rehearsal.critic')::uuid
     AND user_id = current_setting('rehearsal.owner')::uuid AND created_at = now()),
o AS (SELECT what, row_number() OVER (ORDER BY what) AS r FROM rh_old)
UPDATE rh_old SET notice_id = n.id FROM n JOIN o ON o.r = n.r WHERE rh_old.what = o.what;
SELECT pg_temp.rh_need('old notices found', (SELECT count(DISTINCT notice_id) FROM rh_old), 4) AS done \gset rh_
UPDATE public.notifications n SET group_key = NULL, created_at = o.at,
       message = CASE WHEN o.what = 'the stack' THEN 'left a critique on your stack “x”.' ELSE 'left a critique on your log of x.' END
  FROM rh_old o WHERE n.id = o.notice_id;
-- The deleted critique's notice outlives it.
DELETE FROM public.log_comments WHERE id = (SELECT comment_id FROM rh_old WHERE what = 'a critique since deleted');
-- A notice the migration must leave as it is: a Dispatch critique's key, a follow's none.
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

-- ── the migration ────────────────────────────────────────────────────────────
-- The train applies it here (with_train). A copy that holds it already runs it once more, over the
-- staged notices: its writers are replaced as they are, and it keys only keyless notices, so the
-- staged ones are given their keys and nothing else changes. A copy without it runs nothing, and
-- every case of it fails (rehearsals.mjs --without).
SELECT position('endorse:log:' IN prosrc) > 0 AS held FROM pg_proc
 WHERE oid = 'public.notify_on_log_comment()'::regprocedure \gset rh_
\if :{?with_train}
\ir ../../../supabase/migrations/20261109_03_a_critique_opens_what_it_is_on.sql
\elif :rh_held
\ir ../../../supabase/migrations/20261109_03_a_critique_opens_what_it_is_on.sql
\endif

-- ── a member's critiques, as the member ──────────────────────────────────────
CREATE TEMP TABLE rh_new (what text PRIMARY KEY, got text) ON COMMIT DROP;
GRANT ALL ON rh_new TO authenticated;
CREATE FUNCTION pg_temp.rh_critique_as_critic() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', current_setting('rehearsal.critic'), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  BEGIN
    INSERT INTO public.log_comments (log_id, user_id, username, body)
    VALUES (current_setting('rehearsal.log2')::uuid, current_setting('rehearsal.critic')::uuid, 'rh', 'a new critique of the log');
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
   AND n.id NOT IN (SELECT notice_id FROM rh_old) AND n.id NOT IN (SELECT id FROM rh_kept);

-- ── the verdict ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM pg_temp.rh_case('a member''s critique is written', 'none', coalesce((SELECT got FROM rh_new WHERE what = 'refused'), 'none'));
  PERFORM pg_temp.rh_case('a member''s critique of a log names the log', 'endorse:log:' || current_setting('rehearsal.log2'),
    (SELECT got FROM rh_new WHERE what = 'the log'));
  PERFORM pg_temp.rh_case('a member''s critique of a stack names the stack', 'endorse:list:' || current_setting('rehearsal.list'),
    (SELECT got FROM rh_new WHERE what = 'the stack'));
  PERFORM pg_temp.rh_case('an old critique of a log is given its log', 'endorse:log:' || current_setting('rehearsal.log1'),
    (SELECT n.group_key FROM public.notifications n JOIN rh_old o ON o.notice_id = n.id WHERE o.what = 'the first log'));
  PERFORM pg_temp.rh_case('its critic''s critique of the owner''s other log is given that log', 'endorse:log:' || current_setting('rehearsal.log2'),
    (SELECT n.group_key FROM public.notifications n JOIN rh_old o ON o.notice_id = n.id WHERE o.what = 'the second log'));
  PERFORM pg_temp.rh_case('an old critique of a stack is given its stack', 'endorse:list:' || current_setting('rehearsal.list'),
    (SELECT n.group_key FROM public.notifications n JOIN rh_old o ON o.notice_id = n.id WHERE o.what = 'the stack'));
  PERFORM pg_temp.rh_case('a notice whose critique is gone keeps no key', 'none',
    (SELECT coalesce(n.group_key, 'none') FROM public.notifications n JOIN rh_old o ON o.notice_id = n.id WHERE o.what = 'a critique since deleted'));
  PERFORM pg_temp.rh_case('a Dispatch critique keeps its key', (SELECT key FROM rh_kept WHERE what = 'a Dispatch critique keeps its key'),
    (SELECT n.group_key FROM public.notifications n JOIN rh_kept k ON k.id = n.id WHERE k.what = 'a Dispatch critique keeps its key'));
  PERFORM pg_temp.rh_case('a follow keeps no key', 'none',
    (SELECT coalesce(n.group_key, 'none') FROM public.notifications n JOIN rh_kept k ON k.id = n.id WHERE k.what = 'a follow keeps no key'));
END $$;

SELECT pg_temp.rh_verdict();
ROLLBACK;
