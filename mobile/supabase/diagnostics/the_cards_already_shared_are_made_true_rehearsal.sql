-- ════════════════════════════════════════════════════════════════════════════
-- the_cards_already_shared_are_made_true_rehearsal.sql — 20261120_11. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs the_cards_already_shared_are_made_true_rehearsal.sql
--
-- 20261120_11 is applied on production (the train of 2026-11-22); this shows it still holds there, and on every sealed copy.
-- Then the house and members in good standing, acting as themselves, find what it fixes holding (review round 14).
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
GRANT SELECT ON rehearsal_members TO anon, authenticated;

-- The piece's own tables, made before the train, empty: the piece fills them as it runs.
CREATE TEMP TABLE ha4p_ids (what text PRIMARY KEY, id uuid) ON COMMIT DROP;

-- ── H-A4.pass ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.interaction_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interaction_churn WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.critique_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
-- ── H-A4.pass rehearsal · the cards already in the salons are the house's (review round 14) ──
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train (H-A4, H-A4.locks
-- and H-A4.pass applied), with its rehearsal_members (n = 1..4). The rule the pass applies is H-A4's
-- rehearsal's (forged cards made true, as the pass asks it); here, what the pass leaves: every standing
-- card of a film, a person, a record, a stack or a filing, sealed and gone ones aside, is exactly the
-- card the house writes of its piece, so no forged byline, headline, count, kind or picture stands; and a
-- card written since, by a member, is the house's too (the trigger stood before the pass ran). Then the
-- pass's function itself: asked by the house alone; a card forged after the fact (as the house, which the
-- trigger does not judge) is made true by its part, not by the parts beside it; a part run again writes nothing;
-- a part outside 0 to 15 is refused.

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
SELECT pg_temp.rh_case('every standing card is the card the house writes of its piece', '0',
  (SELECT count(*)::text FROM public.lounge_messages x, LATERAL private.a_shared_card(x, false) c
    WHERE x.type IN ('film_share', 'person_share', 'log_share', 'list_share', 'dossier_share')
      AND NOT (coalesce(x.metadata, '{}'::jsonb) @> '{"gone": true}'::jsonb)
      AND NOT (coalesce(x.metadata, '{}'::jsonb) @> '{"sealed": true}'::jsonb)
      AND (x.film_id, x.film_title, x.film_poster, x.metadata) IS DISTINCT FROM (c.film_id, c.film_title, c.film_poster, c.metadata))) AS done \gset rh_
SELECT pg_temp.rh_case('the card trigger stands, so no card written after the pass escapes it', '1',
  (SELECT count(*)::text FROM pg_trigger WHERE tgrelid = 'public.lounge_messages'::regclass AND tgname = 'a_shared_card_is_the_houses' AND NOT tgisinternal)) AS done \gset rh_
SELECT pg_temp.rh_case('the pass is asked by the house alone: no member, visitor or anyone else may run it', 'false|false|false',
  has_function_privilege('authenticated', 'private.the_cards_made_true(integer)', 'EXECUTE')::text || '|'
  || has_function_privilege('anon', 'private.the_cards_made_true(integer)', 'EXECUTE')::text || '|'
  || (SELECT coalesce(bool_or(a.grantee = 0), false)::text FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
       WHERE p.oid = 'private.the_cards_made_true(integer)'::regprocedure)) AS done \gset rh_

-- A salon of member 1's with one word of member 1's, its card then forged as the house (the trigger
-- judges what is inserted; an update by the house is not judged), under an id in part 'c'.
UPDATE public.profiles SET tier = 'archivist', is_banned = false, suspended_until = NULL
 WHERE id = (SELECT id FROM rehearsal_members WHERE n = 1);
WITH made AS (INSERT INTO public.lounges (name, creator_id, is_private)
              VALUES ('rh H-A4.pass a salon', (SELECT id FROM rehearsal_members WHERE n = 1), false) RETURNING id)
INSERT INTO ha4p_ids SELECT 'salon', id FROM made;
INSERT INTO ha4p_ids VALUES ('card', ('c' || substr(gen_random_uuid()::text, 2))::uuid);
INSERT INTO public.lounge_messages (id, lounge_id, user_id, content)
VALUES ((SELECT id FROM ha4p_ids WHERE what = 'card'), (SELECT id FROM ha4p_ids WHERE what = 'salon'),
        (SELECT id FROM rehearsal_members WHERE n = 1), 'rh H-A4.pass a word');
UPDATE public.lounge_messages
   SET type = 'person_share', film_title = NULL, film_poster = NULL,
       metadata = jsonb_build_object('personId', 42, 'name', 'rh a person', 'curator', 'rh_forged', 'author_username', 'rh_forged')
 WHERE id = (SELECT id FROM ha4p_ids WHERE what = 'card');
SELECT private.the_cards_made_true(11) + private.the_cards_made_true(13) AS done \gset rh_
SELECT pg_temp.rh_case('a card forged after the fact is left by the parts on either side of its own', 'rh_forged',
  (SELECT metadata ->> 'curator' FROM public.lounge_messages WHERE id = (SELECT id FROM ha4p_ids WHERE what = 'card'))) AS done \gset rh_
SELECT pg_temp.rh_case('its part makes it true: the one card rewritten', '1', private.the_cards_made_true(12)::text) AS done \gset rh_
SELECT pg_temp.rh_case('and the card is the house''s: the person and their name, no byline', '{"name": "rh a person", "personId": 42}',
  (SELECT metadata::text FROM public.lounge_messages WHERE id = (SELECT id FROM ha4p_ids WHERE what = 'card'))) AS done \gset rh_
SELECT pg_temp.rh_case('the part run again writes nothing', '0', private.the_cards_made_true(12)::text) AS done \gset rh_
DO $$
BEGIN
  PERFORM private.the_cards_made_true(16);
  PERFORM pg_temp.rh_case('a part outside 0 to 15 is refused', 'refused', 'ran');
EXCEPTION WHEN invalid_parameter_value THEN
  PERFORM pg_temp.rh_case('a part outside 0 to 15 is refused', 'refused', 'refused');
END $$;

SELECT pg_temp.rh_verdict();
ROLLBACK;
