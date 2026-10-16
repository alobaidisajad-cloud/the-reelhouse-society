-- ════════════════════════════════════════════════════════════════════════════
-- a_member_may_always_leave_rehearsal.sql — 20261016_02. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_member_may_always_leave_rehearsal.sql --with-train
--
-- With with_train set, 20261016_02 is applied first, inside this transaction
-- (production, before the apply); without it, it must already be applied
-- (db-integration.yml, after up-down-up). Three members are taken: one silenced,
-- one suspended, one in good standing, and a fourth who keeps a seat. Each of
-- the three is given, as the house, a critique on the fourth's log, a note on
-- the fourth's stack and a salon the fourth sits in; then each closes their own
-- account, signed in as the app signs in. Each must be gone, their words kept
-- under '[deleted]', their salon passed to the fourth; the fourth untouched.
-- Read each NOTICE as  case|expected|got ; the last line is the verdict, and
-- any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql
\if :{?with_train}
\ir ../../../supabase/migrations/20261016_02_a_member_may_always_leave.sql
\endif

-- As the house: claims cleared, so no member's gate judges the setup.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
CREATE TEMP TABLE rh_who (what text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT ON rh_who TO authenticated;
INSERT INTO rh_who
SELECT what, pg_temp.rh_found('a member to ' || what, id) FROM (
  SELECT 'silenced' AS what, id FROM public.profiles WHERE role <> 'admin' ORDER BY created_at LIMIT 1) s;
INSERT INTO rh_who
SELECT 'suspended', pg_temp.rh_found('a second member', (SELECT id FROM public.profiles WHERE role <> 'admin'
  AND id NOT IN (SELECT id FROM rh_who) ORDER BY created_at LIMIT 1));
INSERT INTO rh_who
SELECT 'in good standing', pg_temp.rh_found('a third member', (SELECT id FROM public.profiles WHERE role <> 'admin'
  AND id NOT IN (SELECT id FROM rh_who) ORDER BY created_at LIMIT 1));
INSERT INTO rh_who
SELECT 'seated', pg_temp.rh_found('a fourth member', (SELECT id FROM public.profiles
  WHERE id NOT IN (SELECT id FROM rh_who) ORDER BY created_at LIMIT 1));
CREATE FUNCTION pg_temp.rh_member(member text) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM rh_who WHERE what = member $$;

UPDATE public.profiles SET is_banned = false, suspended_until = NULL WHERE id IN (SELECT id FROM rh_who);
UPDATE public.profiles SET is_banned = true, banned_at = now() WHERE id = pg_temp.rh_member('silenced');
UPDATE public.profiles SET suspended_until = now() + interval '1 day' WHERE id = pg_temp.rh_member('suspended');

-- The fourth's log and stack, and for each leaving member a critique, a note and a salon the fourth sits in.
CREATE TEMP TABLE rh_rows (what text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT ON rh_rows TO authenticated;
WITH r AS (INSERT INTO public.logs (user_id, film_id, film_title, watched_date)
           VALUES (pg_temp.rh_member('seated'), 990680, 'rh film', current_date) RETURNING id)
INSERT INTO rh_rows SELECT 'the log', id FROM r;
WITH r AS (INSERT INTO public.lists (user_id, title) VALUES (pg_temp.rh_member('seated'), 'rh stack') RETURNING id)
INSERT INTO rh_rows SELECT 'the stack', id FROM r;
DO $$
DECLARE w record; v_lounge uuid;
BEGIN
  FOR w IN SELECT what, id FROM rh_who WHERE what <> 'seated' LOOP
    INSERT INTO public.log_comments (log_id, user_id, username, body)
    VALUES ((SELECT id FROM rh_rows WHERE what = 'the log'), w.id, 'rh', 'rh critique of ' || w.what);
    INSERT INTO public.list_comments (list_id, user_id, content)
    VALUES ((SELECT id FROM rh_rows WHERE what = 'the stack'), w.id, 'rh note of ' || w.what);
    INSERT INTO public.lounges (name, creator_id, is_private) VALUES ('rh salon of ' || w.what, w.id, false)
    RETURNING id INTO v_lounge;
    INSERT INTO public.lounge_members (lounge_id, user_id, status)
    VALUES (v_lounge, w.id, 'approved'), (v_lounge, pg_temp.rh_member('seated'), 'approved');
    INSERT INTO rh_rows VALUES ('salon of ' || w.what, v_lounge);
  END LOOP;
END $$;

-- A call tried alone and kept: 'ok', or its SQLSTATE and words.
CREATE FUNCTION pg_temp.rh_try(stmt text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE stmt;
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE || ': ' || SQLERRM;
END $$;
CREATE TEMP TABLE rh_got (what text PRIMARY KEY, got text) ON COMMIT DROP;
GRANT INSERT ON rh_got TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.rh_try(text), pg_temp.rh_member(text) TO authenticated;

-- ── each closes their own account, signed in ─────────────────────────────────
DO $$
DECLARE w record;
BEGIN
  FOR w IN SELECT what, id FROM rh_who WHERE what <> 'seated' LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', w.id, 'role', 'authenticated')::text, true);
    PERFORM set_config('role', 'authenticated', true);
    INSERT INTO rh_got VALUES (w.what, pg_temp.rh_try('SELECT public.request_account_deletion()'));
    PERFORM set_config('role', 'none', true);
    PERFORM set_config('request.jwt.claims', '', true);
  END LOOP;
END $$;

-- ── the verdict ──────────────────────────────────────────────────────────────
CREATE FUNCTION pg_temp.rh_left(what text) RETURNS text LANGUAGE sql AS $$
  SELECT (SELECT got FROM rh_got WHERE rh_got.what = rh_left.what)
    || '|' || (NOT EXISTS (SELECT 1 FROM auth.users WHERE id = pg_temp.rh_member(what)))::text
    || '|' || coalesce((SELECT string_agg(username, ',') FROM public.log_comments
                         WHERE body = 'rh critique of ' || what), 'none')
    || '|' || coalesce((SELECT (user_id IS NULL)::text FROM public.list_comments
                         WHERE content = 'rh note of ' || what), 'none')
    || '|' || coalesce((SELECT (creator_id = pg_temp.rh_member('seated'))::text FROM public.lounges
                         WHERE id = (SELECT id FROM rh_rows WHERE rh_rows.what = 'salon of ' || rh_left.what)), 'none')
$$;
DO $$
BEGIN
  PERFORM pg_temp.rh_case('a silenced member closes their account: gone, words kept as [deleted], salon passed on',
    'ok|true|[deleted]|true|true', pg_temp.rh_left('silenced'));
  PERFORM pg_temp.rh_case('so does a suspended member', 'ok|true|[deleted]|true|true', pg_temp.rh_left('suspended'));
  PERFORM pg_temp.rh_case('and one in good standing, as before', 'ok|true|[deleted]|true|true', pg_temp.rh_left('in good standing'));
  PERFORM pg_temp.rh_case('the member who sat with them is untouched', 'true|true',
    (EXISTS (SELECT 1 FROM auth.users WHERE id = pg_temp.rh_member('seated')))::text || '|'
    || (EXISTS (SELECT 1 FROM public.logs WHERE id = (SELECT id FROM rh_rows WHERE what = 'the log')))::text);
  PERFORM pg_temp.rh_case('the three functions nothing calls are gone', 'true|true|true',
    (to_regprocedure('public.get_profile_metrics(uuid)') IS NULL)::text || '|'
    || (to_regprocedure('public.get_user_lounges(uuid)') IS NULL)::text || '|'
    || (to_regprocedure('public.replace_list_items(uuid, jsonb)') IS NULL)::text);
END $$;

SELECT pg_temp.rh_verdict();
ROLLBACK;
