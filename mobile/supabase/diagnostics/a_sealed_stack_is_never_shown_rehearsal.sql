-- ════════════════════════════════════════════════════════════════════════════
-- a_sealed_stack_is_never_shown_rehearsal.sql — 20261119_15. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_sealed_stack_is_never_shown_rehearsal.sql --with-train
--
-- The train applies 20261119_15 here (with_train), 20261119_00 to 20261119_14 already applied; a sealed copy already holds it.
-- Then the house find what it fixes holding (review round 13).
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

-- The train applies it here first (with_train), on production as the cars before it left it; a sealed
-- copy already holds every pending migration.
\if :{?with_train}
\ir ../../../supabase/migrations/20261119_15_a_sealed_stack_is_never_shown.sql
\endif

-- ── B3 ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.interaction_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interaction_churn WHERE user_id IN (SELECT id FROM rehearsal_members);
-- ── B3 rehearsal · the cards of stacks already sealed are turned, and no client may call the triggers' functions (review round 13) ──
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train (B3.up applied;
-- its triggers are B3.locks, rehearsed there). Over the whole house: no card of a stack sealed now
-- still carries the stack's words (the one-time turn reached every one), and no member or visitor
-- may call either function the triggers run.
DO $$ BEGIN
  PERFORM pg_temp.rh_case('no card of a sealed stack still shows its title, count or curator', '0',
    (SELECT count(*)::text
       FROM public.lists l
       JOIN public.lounge_messages m
         ON m.type = 'list_share' AND m.metadata <> '{}'::jsonb
        AND m.metadata @> jsonb_build_object('listId', l.id::text)
      WHERE l.is_private
        AND (m.metadata ? 'title' OR m.metadata ? 'filmCount' OR m.metadata ? 'curator' OR m.metadata ? 'topPosters')));
  PERFORM pg_temp.rh_case('no member or visitor runs the functions of a sealed stack''s cards', 'false|false|false|false',
    has_function_privilege('authenticated', 'public.a_sealed_stack_is_not_shared()', 'EXECUTE')::text || '|'
    || has_function_privilege('anon', 'public.a_sealed_stack_is_not_shared()', 'EXECUTE')::text || '|'
    || has_function_privilege('authenticated', 'public.a_sealed_stack_takes_its_cards()', 'EXECUTE')::text || '|'
    || has_function_privilege('anon', 'public.a_sealed_stack_takes_its_cards()', 'EXECUTE')::text);
END $$;

SELECT pg_temp.rh_verdict();
ROLLBACK;
