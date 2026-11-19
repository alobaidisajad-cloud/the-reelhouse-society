-- ════════════════════════════════════════════════════════════════════════════
-- a_spoiler_take_veils_its_cards_rehearsal.sql — 20261119_16. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_spoiler_take_veils_its_cards_rehearsal.sql --with-train
--
-- The train applies 20261119_16 here (with_train), 20261119_00 to 20261119_15 already applied; a sealed copy already holds it.
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
-- 20261119_16 is applied on production (the train of 2026-11-19); this shows it still holds there.

-- ── B9 ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.interaction_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interaction_churn WHERE user_id IN (SELECT id FROM rehearsal_members);
-- ── B9 rehearsal · no card of a filing marked SPOILERS prints its words (review round 13) ──
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train (B9.up applied;
-- its trigger is B9.locks, rehearsed there). Over the whole house: every standing card of a filing
-- marked SPOILERS is titled by the share's rule (the one-time turn reached every one), and no member
-- or visitor may call the rule's function.
DO $$ BEGIN
  PERFORM pg_temp.rh_case('every standing card of a filing marked SPOILERS is titled by the rule, never its words', '0',
    (SELECT count(*)::text
       FROM public.dispatch_posts p
       JOIN public.lounge_messages m
         ON m.type = 'dossier_share' AND m.metadata <> '{}'::jsonb
        AND m.metadata @> jsonb_build_object('dossier_id', p.id::text)
      WHERE p.spoiler_label IS NOT NULL AND p.ended_at IS NULL
        AND NOT (m.metadata @> '{"gone": true}'::jsonb)
        AND m.film_title IS DISTINCT FROM public.a_filings_shared_line(p.kind, p.title, p.body, p.spoiler_label,
              CASE WHEN p.subject_kind = 'film' THEN p.subject_title END)));
  PERFORM pg_temp.rh_case('no member or visitor runs the rule''s function or the trigger''s', 'false|false|false|false',
    has_function_privilege('authenticated', 'public.a_filings_shared_line(text, text, text, text, text)', 'EXECUTE')::text || '|'
    || has_function_privilege('anon', 'public.a_filings_shared_line(text, text, text, text, text)', 'EXECUTE')::text || '|'
    || has_function_privilege('authenticated', 'public.a_spoiler_take_veils_its_cards()', 'EXECUTE')::text || '|'
    || has_function_privilege('anon', 'public.a_spoiler_take_veils_its_cards()', 'EXECUTE')::text);
END $$;

SELECT pg_temp.rh_verdict();
ROLLBACK;
