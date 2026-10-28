-- ════════════════════════════════════════════════════════════════════════════
-- a_row_is_dated_by_the_house_rehearsal.sql — 20261028_02. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_row_is_dated_by_the_house_rehearsal.sql --with-train
--
-- With with_train set, 20261028_02 is applied first, inside this transaction
-- (production, before the apply); without it, it must already be applied
-- (db-integration.yml, after up-down-up). A member whose phone is a day ahead
-- reads a salon, edits a filing and edits a critique, each write carrying the
-- phone's time as the app sends it; each time reads back as the house's now(),
-- the transaction's own. A change that sends no time leaves the time it had.
-- Read each NOTICE as  case|expected|got ; the last line is the verdict, and
-- any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql
\if :{?with_train}
\ir ../../../supabase/migrations/20261028_02_a_row_is_dated_by_the_house.sql
\endif

-- As the house: claims cleared, so no member's gate judges the setup.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
CREATE TEMP TABLE rh_who (what text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT ON rh_who TO authenticated;
INSERT INTO rh_who
SELECT 'member', pg_temp.rh_found('a member whose phone is a day ahead',
  (SELECT id FROM public.profiles WHERE role <> 'admin' ORDER BY created_at LIMIT 1));
INSERT INTO rh_who
SELECT 'host', pg_temp.rh_found('a second member, the salon''s host',
  (SELECT id FROM public.profiles WHERE role <> 'admin' AND id NOT IN (SELECT id FROM rh_who) ORDER BY created_at LIMIT 1));
UPDATE public.profiles SET is_banned = false, suspended_until = NULL WHERE id IN (SELECT id FROM rh_who);

-- The member's seat in the host's salon, their filing, and their critique on it.
CREATE TEMP TABLE rh_rows (what text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT ON rh_rows TO authenticated;
WITH r AS (INSERT INTO public.lounges (name, creator_id, is_private)
           VALUES ('rh salon', (SELECT id FROM rh_who WHERE what = 'host'), false) RETURNING id)
INSERT INTO rh_rows SELECT 'salon', id FROM r;
INSERT INTO public.lounge_members (lounge_id, user_id, status, last_read_at)
VALUES ((SELECT id FROM rh_rows WHERE what = 'salon'), (SELECT id FROM rh_who WHERE what = 'member'), 'approved', now() - interval '1 hour');
WITH r AS (INSERT INTO public.dispatch_posts (kind, user_id, author_username, body)
           VALUES ('take', (SELECT id FROM rh_who WHERE what = 'member'),
                   (SELECT username FROM public.profiles WHERE id = (SELECT id FROM rh_who WHERE what = 'member')), 'rh: a take')
           RETURNING id)
INSERT INTO rh_rows SELECT 'filing', id FROM r;
WITH r AS (INSERT INTO public.dispatch_comments (post_id, user_id, author_username, body)
           VALUES ((SELECT id FROM rh_rows WHERE what = 'filing'), (SELECT id FROM rh_who WHERE what = 'member'),
                   (SELECT username FROM public.profiles WHERE id = (SELECT id FROM rh_who WHERE what = 'member')), 'rh: a critique')
           RETURNING id)
INSERT INTO rh_rows SELECT 'critique', id FROM r;
UPDATE public.dispatch_comments SET edited_at = now() - interval '2 hours' WHERE id = (SELECT id FROM rh_rows WHERE what = 'critique');

-- ── as the member, the phone a day ahead ─────────────────────────────────────
DO $$
DECLARE tomorrow text := (now() + interval '1 day')::text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', (SELECT id FROM rh_who WHERE what = 'member'), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  EXECUTE format('UPDATE public.lounge_members SET last_read_at = %L WHERE lounge_id = %L AND user_id = %L',
    tomorrow, (SELECT id FROM rh_rows WHERE what = 'salon'), (SELECT id FROM rh_who WHERE what = 'member'));
  EXECUTE format('UPDATE public.dispatch_posts SET body = %L, edited_at = %L, updated_at = %L WHERE id = %L',
    'rh: a take, edited', tomorrow, tomorrow, (SELECT id FROM rh_rows WHERE what = 'filing'));
  EXECUTE format('UPDATE public.dispatch_comments SET body = %L WHERE id = %L',
    'rh: a critique, its words alone changed', (SELECT id FROM rh_rows WHERE what = 'critique'));
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
END $$;

-- The critique's words alone changed: its time as it was, read before its own dated edit below.
CREATE TEMP TABLE rh_kept ON COMMIT DROP AS
SELECT (edited_at = now() - interval '2 hours')::text AS kept FROM public.dispatch_comments
 WHERE id = (SELECT id FROM rh_rows WHERE what = 'critique');

DO $$
DECLARE tomorrow text := (now() + interval '1 day')::text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', (SELECT id FROM rh_who WHERE what = 'member'), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  EXECUTE format('UPDATE public.dispatch_comments SET body = %L, edited_at = %L WHERE id = %L',
    'rh: a critique, edited', tomorrow, (SELECT id FROM rh_rows WHERE what = 'critique'));
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
END $$;

-- ── the verdict ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM pg_temp.rh_case('a salon read with the phone a day ahead is read now, not tomorrow', 'true',
    (SELECT (last_read_at = now())::text FROM public.lounge_members
      WHERE lounge_id = (SELECT id FROM rh_rows WHERE what = 'salon') AND user_id = (SELECT id FROM rh_who WHERE what = 'member')));
  PERFORM pg_temp.rh_case('a filing edited with the phone a day ahead is edited and changed now', 'true|true|rh: a take, edited',
    (SELECT (edited_at = now())::text || '|' || (updated_at = now())::text || '|' || body FROM public.dispatch_posts
      WHERE id = (SELECT id FROM rh_rows WHERE what = 'filing')));
  PERFORM pg_temp.rh_case('a critique whose words alone changed keeps the time it had', 'true', (SELECT kept FROM rh_kept));
  PERFORM pg_temp.rh_case('a critique edited with the phone a day ahead is edited now', 'true|rh: a critique, edited',
    (SELECT (edited_at = now())::text || '|' || body FROM public.dispatch_comments
      WHERE id = (SELECT id FROM rh_rows WHERE what = 'critique')));
END $$;

SELECT pg_temp.rh_verdict();
ROLLBACK;
