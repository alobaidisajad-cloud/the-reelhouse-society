-- ════════════════════════════════════════════════════════════════════════════
-- an_edit_keeps_what_changed_since_rehearsal.sql — 20261101_01. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs an_edit_keeps_what_changed_since_rehearsal.sql --with-train
--
-- With with_train set, 20261101_01 is applied first, inside this transaction
-- (production, before the apply); without it, it must already be applied
-- (db-integration.yml, after up-down-up). A member's phone read their stack
-- three days ago; since then another device added a film to it. The phone's
-- edit, sent with the time it read the stack, is refused (PT412) and the film
-- stays; an edit sent with the stack's time now saves, exactly its films; an
-- older call, with no time, saves as before. The transaction's now() stands
-- still, so "three days ago" is written into the stack as it is made.
-- Read each NOTICE as  case|expected|got ; the last line is the verdict, and
-- any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql
\if :{?with_train}
\ir ../../../supabase/migrations/20261101_01_an_edit_keeps_what_changed_since.sql
\endif

-- As the house: claims cleared, so no member's gate judges the setup.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
CREATE TEMP TABLE rh_who (what text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT ON rh_who TO authenticated;
INSERT INTO rh_who
SELECT 'member', pg_temp.rh_found('a member who keeps a stack',
  (SELECT id FROM public.profiles WHERE role <> 'admin' ORDER BY created_at LIMIT 1));
UPDATE public.profiles SET is_banned = false, suspended_until = NULL WHERE id IN (SELECT id FROM rh_who);

-- The stack as the phone read it, three days ago, with no films yet.
CREATE TEMP TABLE rh_rows (what text PRIMARY KEY, id uuid, got text) ON COMMIT DROP;
GRANT ALL ON rh_rows TO authenticated;
WITH r AS (INSERT INTO public.lists (user_id, title, updated_at)
           VALUES ((SELECT id FROM rh_who WHERE what = 'member'), 'rh: a stack', now() - interval '3 days')
           RETURNING id)
INSERT INTO rh_rows SELECT 'stack', id, NULL FROM r;

-- ── as the member ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_stack uuid := (SELECT id FROM rh_rows WHERE what = 'stack');
  v_read timestamptz := now() - interval '3 days';
  v_state text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', (SELECT id FROM rh_who WHERE what = 'member'), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);

  -- Another device adds a film.
  INSERT INTO public.list_items (list_id, film_id, film_title, rank_position) VALUES (v_stack, 9001, 'rh: added elsewhere', 1);
  INSERT INTO rh_rows VALUES ('moved', NULL, (SELECT (updated_at = now())::text FROM public.lists WHERE id = v_stack));

  -- The phone's edit, read before that film, would leave only its own film.
  BEGIN
    PERFORM public.save_stack(p_id => v_stack, p_films => '[{"film_id": 9002, "film_title": "rh: the phone''s", "rank_position": 1}]'::jsonb, p_read_at => v_read);
    v_state := 'saved';
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
  END;
  INSERT INTO rh_rows VALUES ('stale', NULL, v_state || '|' || (SELECT string_agg(film_id::text, ',' ORDER BY film_id) FROM public.list_items WHERE list_id = v_stack));

  -- Read now, the same edit saves, exactly its films, and hands back the stack's new time. Its films
  -- are read in a statement of their own: one statement reads as it began, before the save.
  SELECT (s.updated_at = now())::text INTO v_state FROM public.save_stack(p_id => v_stack,
    p_films => '[{"film_id": 9001, "film_title": "rh: added elsewhere", "rank_position": 1}, {"film_id": 9002, "film_title": "rh: the phone''s", "rank_position": 2}]'::jsonb,
    p_read_at => (SELECT updated_at FROM public.lists WHERE id = v_stack)) AS s;
  INSERT INTO rh_rows VALUES ('fresh', NULL, v_state
    || '|' || (SELECT string_agg(film_id::text, ',' ORDER BY film_id) FROM public.list_items WHERE list_id = v_stack));

  -- An older call, with no time, saves as before.
  PERFORM public.save_stack(p_id => v_stack, p_title => 'rh: retitled', p_films => '[{"film_id": 9002, "film_title": "rh: the phone''s", "rank_position": 1}]'::jsonb);
  INSERT INTO rh_rows VALUES ('older', NULL, (SELECT title FROM public.lists WHERE id = v_stack)
    || '|' || (SELECT string_agg(film_id::text, ',' ORDER BY film_id) FROM public.list_items WHERE list_id = v_stack));

  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
END $$;

-- ── the verdict ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM pg_temp.rh_case('a film added from another device moves the stack''s time', 'true',
    (SELECT got FROM rh_rows WHERE what = 'moved'));
  PERFORM pg_temp.rh_case('an edit read before that film is refused, and the film stays', 'PT412|9001',
    (SELECT got FROM rh_rows WHERE what = 'stale'));
  PERFORM pg_temp.rh_case('an edit read after it saves exactly its films, at the house''s now', 'true|9001,9002',
    (SELECT got FROM rh_rows WHERE what = 'fresh'));
  PERFORM pg_temp.rh_case('an older call, with no time, saves as before', 'rh: retitled|9002',
    (SELECT got FROM rh_rows WHERE what = 'older'));
END $$;

SELECT pg_temp.rh_verdict();
ROLLBACK;
