-- ════════════════════════════════════════════════════════════════════════════
-- a_moderators_words_are_cleaned_as_a_members_are_rehearsal.sql — 20261122_00. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_moderators_words_are_cleaned_as_a_members_are_rehearsal.sql --with-train
--
-- The train applies 20261122_00 here (with_train); a sealed copy already holds it.
-- Then the house and members in good standing, acting as themselves, find what it fixes holding.
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

-- The piece's own rows, each by what it is; and the words as a script might send them: a right-to-left
-- override (U+202E) and a zero-width space (U+200B) inside, which the cleaner takes out.
CREATE TEMP TABLE mw_ids (what text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT ON mw_ids TO authenticated;
CREATE TEMP TABLE mw_words (what text PRIMARY KEY, sent text, kept text) ON COMMIT DROP;
GRANT SELECT ON mw_words TO authenticated;
INSERT INTO mw_words VALUES
  ('word',   'rh the' || chr(8203) || ' word' || chr(8238) || ' of the Tribunal', 'rh the word of the Tribunal'),
  ('reason', 'rh lifted' || chr(8238) || ' early',                               'rh lifted early'),
  ('appeal', 'rh I' || chr(8238) || ' appeal',                                    'rh I appeal');

-- Members 3 and 4 are the house's moderators; 2 is the member the verdicts are about.
UPDATE public.profiles SET is_banned = false, banned_at = NULL, suspended_until = NULL, suspension_reason = NULL, warning_count = 0
 WHERE id IN (SELECT id FROM rehearsal_members);
UPDATE public.profiles SET role = 'admin' WHERE id IN (SELECT id FROM rehearsal_members WHERE n IN (3, 4));
UPDATE public.profiles SET role = 'free' WHERE id IN (SELECT id FROM rehearsal_members WHERE n < 3) AND role = 'admin';
DELETE FROM public.mod_actions WHERE target_user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.warnings WHERE user_id IN (SELECT id FROM rehearsal_members);

-- Written before this car, as production kept them: a verdict on 2 by 4, its appeal heard by 3 and
-- overturned, its words as they were typed, and the notice that told 2 the Tribunal's word.
WITH made AS (
  INSERT INTO public.mod_actions (target_user_id, admin_id, action, reason, appeal, appeal_filed_at, appeal_status,
                                  appeal_judged_by, appeal_judged_at, appeal_note, lifted_at, lifted_by, lift_reason, created_at)
  VALUES ((SELECT id FROM rehearsal_members WHERE n = 2), (SELECT id FROM rehearsal_members WHERE n = 4), 'warn', 'rh an old warning',
          (SELECT sent FROM mw_words WHERE what = 'appeal'), now() - interval '2 days', 'overturned',
          (SELECT id FROM rehearsal_members WHERE n = 3), now() - interval '1 day', (SELECT sent FROM mw_words WHERE what = 'word'),
          now() - interval '1 day', (SELECT id FROM rehearsal_members WHERE n = 3),
          'Overturned on appeal: ' || (SELECT sent FROM mw_words WHERE what = 'word'), now() - interval '3 days')
  RETURNING id)
INSERT INTO mw_ids SELECT 'old verdict', id FROM made;
WITH made AS (
  INSERT INTO public.notifications (user_id, type, title, body, message, metadata, created_at)
  SELECT m.target_user_id, 'moderation', 'Your Appeal Was Heard',
         'rh heard. The Tribunal''s word: ' || (SELECT sent FROM mw_words WHERE what = 'word'),
         'rh heard. The Tribunal''s word: ' || (SELECT sent FROM mw_words WHERE what = 'word'),
         jsonb_build_object('action', 'appeal', 'outcome', 'overturned', 'mod_action_id', m.id), m.appeal_judged_at
    FROM public.mod_actions m WHERE m.id = (SELECT id FROM mw_ids WHERE what = 'old verdict')
  RETURNING id)
INSERT INTO mw_ids SELECT 'old notice', id FROM made;

-- The train applies it here first (with_train), on production as the cars before it left it; a sealed
-- copy already holds every pending migration.
\if :{?with_train}
\ir ../../../supabase/migrations/20261122_00_a_moderators_words_are_cleaned_as_a_members_are.sql
\endif

-- ── a moderator's words are cleaned as a member's are ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

CREATE FUNCTION pg_temp.mw_as(p_member bigint, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_got text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = p_member), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  BEGIN
    EXECUTE p_sql INTO v_got;
  EXCEPTION WHEN OTHERS THEN
    v_got := 'refused: ' || SQLSTATE || ' ' || SQLERRM;
  END;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN coalesce(v_got, 'none');
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.mw_as(bigint, text) TO authenticated;

-- A verdict on 2 by 4, its appeal waiting: 3 hears it and overturns it, the word sent as a script might.
WITH made AS (
  INSERT INTO public.mod_actions (target_user_id, admin_id, action, reason, appeal, appeal_filed_at, appeal_status, created_at)
  VALUES ((SELECT id FROM rehearsal_members WHERE n = 2), (SELECT id FROM rehearsal_members WHERE n = 4), 'warn', 'rh a warning',
          'rh I appeal', now() - interval '1 hour', 'pending', now() - interval '2 hours')
  RETURNING id)
INSERT INTO mw_ids SELECT 'verdict', id FROM made;
SELECT pg_temp.rh_case('3 hears the appeal and overturns it', 'done',
  pg_temp.mw_as(3, format('SELECT ''done'' FROM public.judge_appeal(%L, %L, %L)',
    (SELECT id FROM mw_ids WHERE what = 'verdict'), 'overturned', (SELECT sent FROM mw_words WHERE what = 'word')))) AS done \gset rh_
SELECT pg_temp.rh_case('the verdict keeps the Tribunal''s word cleaned, and the overturn''s reason with it',
  (SELECT kept FROM mw_words WHERE what = 'word') || '|Overturned on appeal: ' || (SELECT kept FROM mw_words WHERE what = 'word'),
  (SELECT appeal_note || '|' || lift_reason FROM public.mod_actions WHERE id = (SELECT id FROM mw_ids WHERE what = 'verdict'))) AS done \gset rh_
SELECT pg_temp.rh_case('2 is told the Tribunal''s word cleaned, in the notice''s words and its body', 'true|true',
  pg_temp.mw_as(2, format('SELECT (message LIKE %L)::text || ''|'' || (body = message)::text FROM public.notifications
     WHERE user_id = auth.uid() AND type = ''moderation'' AND metadata ->> ''mod_action_id'' = %L',
    '%The Tribunal''s word: ' || (SELECT kept FROM mw_words WHERE what = 'word'), (SELECT id FROM mw_ids WHERE what = 'verdict')::text))) AS done \gset rh_

-- 2 under a pause given by 3: 4 lifts it, the reason sent as a script might.
UPDATE public.profiles SET suspended_until = now() + interval '1 day', suspension_reason = 'rh a pause'
 WHERE id = (SELECT id FROM rehearsal_members WHERE n = 2);
WITH made AS (
  INSERT INTO public.mod_actions (target_user_id, admin_id, action, reason, expires_at, created_at)
  VALUES ((SELECT id FROM rehearsal_members WHERE n = 2), (SELECT id FROM rehearsal_members WHERE n = 3), 'suspend', 'rh a pause',
          now() + interval '1 day', now() - interval '30 minutes')
  RETURNING id)
INSERT INTO mw_ids SELECT 'pause', id FROM made;
SELECT pg_temp.rh_case('4 lifts the pause', 'done',
  pg_temp.mw_as(4, format('SELECT ''done'' FROM public.lift_sanction(%L, %L)',
    (SELECT id FROM rehearsal_members WHERE n = 2), (SELECT sent FROM mw_words WHERE what = 'reason')))) AS done \gset rh_
SELECT pg_temp.rh_case('the pause keeps the lift''s reason cleaned', (SELECT kept FROM mw_words WHERE what = 'reason'),
  (SELECT lift_reason FROM public.mod_actions WHERE id = (SELECT id FROM mw_ids WHERE what = 'pause'))) AS done \gset rh_
SELECT pg_temp.rh_case('2 is told the reason cleaned, in the notice''s words and the reason it carries', 'true|' || (SELECT kept FROM mw_words WHERE what = 'reason'),
  pg_temp.mw_as(2, format('SELECT (message LIKE %L)::text || ''|'' || (metadata ->> ''reason'') FROM public.notifications
     WHERE user_id = auth.uid() AND type = ''moderation'' AND metadata ->> ''mod_action_id'' = %L',
    '%Reason: ' || (SELECT kept FROM mw_words WHERE what = 'reason'), (SELECT id FROM mw_ids WHERE what = 'pause')::text))) AS done \gset rh_

-- Whoever writes a verdict's words (the house here), its trigger cleans the appeal, the word and the reason.
WITH made AS (
  INSERT INTO public.mod_actions (target_user_id, admin_id, action, reason, appeal, appeal_filed_at, appeal_status,
                                  appeal_judged_by, appeal_judged_at, appeal_note, lifted_at, lifted_by, lift_reason)
  VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), (SELECT id FROM rehearsal_members WHERE n = 4), 'warn', 'rh a warning to 1',
          (SELECT sent FROM mw_words WHERE what = 'appeal'), now(), 'overturned', (SELECT id FROM rehearsal_members WHERE n = 3), now(),
          (SELECT sent FROM mw_words WHERE what = 'word'), now(), (SELECT id FROM rehearsal_members WHERE n = 3),
          (SELECT sent FROM mw_words WHERE what = 'reason'))
  RETURNING id)
INSERT INTO mw_ids SELECT 'written by the house', id FROM made;
SELECT pg_temp.rh_case('a verdict written with such words keeps them cleaned, whoever writes it',
  (SELECT kept FROM mw_words WHERE what = 'appeal') || '|' || (SELECT kept FROM mw_words WHERE what = 'word') || '|' || (SELECT kept FROM mw_words WHERE what = 'reason'),
  (SELECT appeal || '|' || appeal_note || '|' || lift_reason FROM public.mod_actions WHERE id = (SELECT id FROM mw_ids WHERE what = 'written by the house'))) AS done \gset rh_

-- What was written before: the pass cleans the verdict and the notice that told 2 of it.
SELECT pg_temp.rh_case('the pass is asked by the house alone: no member, visitor or anyone else may run it', 'false|false|false',
  has_function_privilege('authenticated', 'private.the_moderators_words_made_clean()', 'EXECUTE')::text || '|'
  || has_function_privilege('anon', 'private.the_moderators_words_made_clean()', 'EXECUTE')::text || '|'
  || (SELECT coalesce(bool_or(a.grantee = 0), false)::text FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
       WHERE p.oid = 'private.the_moderators_words_made_clean()'::regprocedure)) AS done \gset rh_
SELECT private.the_moderators_words_made_clean() AS made \gset rh_
SELECT pg_temp.rh_case('the verdict written before keeps its appeal, the Tribunal''s word and the overturn''s reason cleaned',
  (SELECT kept FROM mw_words WHERE what = 'appeal') || '|' || (SELECT kept FROM mw_words WHERE what = 'word')
    || '|Overturned on appeal: ' || (SELECT kept FROM mw_words WHERE what = 'word'),
  (SELECT appeal || '|' || appeal_note || '|' || lift_reason FROM public.mod_actions WHERE id = (SELECT id FROM mw_ids WHERE what = 'old verdict'))) AS done \gset rh_
SELECT pg_temp.rh_case('the notice written before tells 2 the word cleaned, as 2 reads it', 'rh heard. The Tribunal''s word: ' || (SELECT kept FROM mw_words WHERE what = 'word'),
  pg_temp.mw_as(2, format('SELECT message FROM public.notifications WHERE id = %L AND body = message',
    (SELECT id FROM mw_ids WHERE what = 'old notice')))) AS done \gset rh_
SELECT pg_temp.rh_case('the pass run again finds nothing left to clean', '0',
  (SELECT private.the_moderators_words_made_clean()::text)) AS done \gset rh_
SELECT pg_temp.rh_case('none of the piece''s rows keeps an override or an invisible space', '0',
  ((SELECT count(*) FROM public.mod_actions m
     WHERE m.id IN (SELECT id FROM mw_ids)
       AND concat(m.appeal, m.appeal_note, m.lift_reason) ~ ('[' || chr(8203) || chr(8238) || ']'))
   + (SELECT count(*) FROM public.notifications n
       WHERE (n.id = (SELECT id FROM mw_ids WHERE what = 'old notice')
              OR n.metadata ->> 'mod_action_id' IN (SELECT id::text FROM mw_ids))
         AND concat(n.body, n.message, n.metadata::text) ~ ('[' || chr(8203) || chr(8238) || ']')))::text) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
