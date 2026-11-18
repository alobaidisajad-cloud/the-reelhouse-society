-- ════════════════════════════════════════════════════════════════════════════
-- a_share_waits_for_a_seal_rehearsal.sql — 20261119_24. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_share_waits_for_a_seal_rehearsal.sql --with-train
--
-- The train applies 20261119_24 here (with_train), 20261119_00 to 20261119_23 already applied; a sealed copy already holds it.
-- Then the house and members in good standing, acting as themselves, find what it fixes holding (review round 13).
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

-- The piece's own tables, made before the train, empty: the piece fills them as it runs.
CREATE TEMP TABLE b10_ids (what text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT ON b10_ids TO authenticated;
CREATE TEMP TABLE b10_seen (what text PRIMARY KEY, got text) ON COMMIT DROP;
GRANT ALL ON b10_seen TO authenticated;

-- The train applies it here first (with_train), on production as the cars before it left it; a sealed
-- copy already holds every pending migration.
\if :{?with_train}
\ir ../../../supabase/migrations/20261119_24_a_share_waits_for_a_seal.sql
\endif

-- ── B10 ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.interaction_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interaction_churn WHERE user_id IN (SELECT id FROM rehearsal_members);
-- ── B10 rehearsal · a share holds its stack's row until it commits, so a seal cannot slip past it (review round 13) ──
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train (B3, B3.locks and
-- B10 applied), with its rehearsal_members (n = 1..4); every row is undone with the transaction.
-- Member 1 (the Archivist's rank for the run) keeps an open stack and a salon, and shares the stack
-- there as the phone does: the card is written, and the stack's row is now held by this transaction
-- (FOR SHARE: its xmax is set, by the share's own subtransaction), so a seal from another session waits for the share to
-- commit and its turn of the cards then sees this card. A sealed stack is still refused, as B3 made it.
-- (The race itself, two sessions at once, is proved on a local copy of the house: B10's report.)
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
UPDATE public.profiles SET tier = 'archivist', is_banned = false, suspended_until = NULL
 WHERE id = (SELECT id FROM rehearsal_members WHERE n = 1);
WITH made AS (INSERT INTO public.lounges (name, creator_id, is_private)
              VALUES ('The Rehearsal Booth', (SELECT id FROM rehearsal_members WHERE n = 1), false) RETURNING id)
INSERT INTO b10_ids SELECT 'salon', id FROM made;
DELETE FROM public.lounge_members WHERE lounge_id = (SELECT id FROM b10_ids WHERE what = 'salon');
INSERT INTO public.lounge_members (lounge_id, user_id, status)
VALUES ((SELECT id FROM b10_ids WHERE what = 'salon'), (SELECT id FROM rehearsal_members WHERE n = 1), 'approved');
WITH made AS (INSERT INTO public.lists (user_id, title, is_private)
              VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), 'rh the held stack', false) RETURNING id)
INSERT INTO b10_ids SELECT 'stack', id FROM made;

CREATE FUNCTION pg_temp.b10_share() RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_got text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 1), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  BEGIN
    INSERT INTO public.lounge_messages (lounge_id, user_id, content, type, metadata)
    VALUES ((SELECT id FROM b10_ids WHERE what = 'salon'), (SELECT id FROM rehearsal_members WHERE n = 1), '', 'list_share',
            jsonb_build_object('listId', (SELECT id FROM b10_ids WHERE what = 'stack')::text, 'title', 'rh the held stack'))
    RETURNING 'shared' INTO v_got;
  EXCEPTION WHEN OTHERS THEN
    v_got := 'refused: ' || SQLSTATE || ' ' || SQLERRM;
  END;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v_got;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.b10_share() TO authenticated;

INSERT INTO b10_seen VALUES ('shared while open', pg_temp.b10_share());
INSERT INTO b10_seen VALUES ('the stack''s row held by the share',
  ((SELECT xmax FROM public.lists WHERE id = (SELECT id FROM b10_ids WHERE what = 'stack'))::text <> '0')::text);
UPDATE public.lists SET is_private = true WHERE id = (SELECT id FROM b10_ids WHERE what = 'stack');
INSERT INTO b10_seen VALUES ('shared while sealed', pg_temp.b10_share());

DO $$ BEGIN
  PERFORM pg_temp.rh_case('an open stack is shared, as before', 'shared', (SELECT got FROM b10_seen WHERE what = 'shared while open'));
  PERFORM pg_temp.rh_case('the share holds the stack''s row until it commits', 'true', (SELECT got FROM b10_seen WHERE what = 'the stack''s row held by the share'));
  PERFORM pg_temp.rh_case('a sealed stack is refused, as before', 'refused: 42501 STACK_SEALED', (SELECT got FROM b10_seen WHERE what = 'shared while sealed'));
END $$;

SELECT pg_temp.rh_verdict();
ROLLBACK;
