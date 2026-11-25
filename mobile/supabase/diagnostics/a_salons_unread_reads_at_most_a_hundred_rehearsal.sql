-- ════════════════════════════════════════════════════════════════════════════
-- a_salons_unread_reads_at_most_a_hundred_rehearsal.sql — 20261122_60. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_salons_unread_reads_at_most_a_hundred_rehearsal.sql
--
-- 20261122_60 is applied on production (the train of 2026-11-24); this shows it still holds there, and on every sealed copy.
-- Production's get_lounge_unread_counts is held here, as it was, to compare with. In
-- salons it plants, as the member who reads them: a salon never read (150 new), one read before (old
-- words, then new ones, the member's own, a hidden member's, and one carrying a hidden member's words),
-- a private one the member still awaits, one with 3,000 new since the reading, and one whose newest
-- hundred hold ten of the member's own. Every salon answers as before, but the last, which counts the
-- readable among its newest hundred; and the whole read reads at most a hundred and a few index rows a
-- salon (the index's own count of rows it returned in this transaction), however many wait.
-- Every row here is undone with the transaction. Read each NOTICE as  case|expected|got ; the last line
-- is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

RESET ROLE;

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
CREATE TEMP TABLE su_members ON COMMIT DROP AS
  SELECT u.id, row_number() OVER (ORDER BY u.created_at) AS n
    FROM auth.users u JOIN public.profiles p ON p.id = u.id
   WHERE NOT coalesce(p.is_banned, false) AND (p.suspended_until IS NULL OR p.suspended_until <= now())
   ORDER BY u.created_at LIMIT 4;
SELECT pg_temp.rh_need('four members in good standing', (SELECT count(*) FROM su_members), 4) AS done \gset rh_
GRANT SELECT ON su_members TO anon, authenticated;
-- Member 1 reads; member 2 writes; member 1 has blocked member 3; member 4 hosts every salon.
UPDATE public.profiles SET tier = 'auteur' WHERE id IN (SELECT id FROM su_members);
DELETE FROM public.user_blocks WHERE blocker_id IN (SELECT id FROM su_members) AND blocked_id IN (SELECT id FROM su_members);
INSERT INTO public.user_blocks (blocker_id, blocked_id, type)
SELECT (SELECT id FROM su_members WHERE n = 1), (SELECT id FROM su_members WHERE n = 3), 'block';
-- Member 1 sits in the planted salons alone.
DELETE FROM public.lounge_members WHERE user_id = (SELECT id FROM su_members WHERE n = 1);

CREATE TEMP TABLE su_rooms (what text PRIMARY KEY, id uuid, private boolean, status text, read_at timestamptz) ON COMMIT DROP;
GRANT SELECT ON su_rooms TO anon, authenticated;
INSERT INTO su_rooms VALUES
  ('never', gen_random_uuid(), false, 'approved', NULL),
  ('since', gen_random_uuid(), false, 'approved', now() - interval '1 hour'),
  ('awaiting', gen_random_uuid(), true, 'pending', NULL),
  ('deep', gen_random_uuid(), false, 'approved', now() - interval '2 days'),
  ('crowded', gen_random_uuid(), false, 'approved', now() - interval '1 hour');
INSERT INTO public.lounges (id, name, creator_id, is_private)
SELECT r.id, 'rh su ' || r.what, (SELECT id FROM su_members WHERE n = 4), r.private FROM su_rooms r;
INSERT INTO public.lounge_members (lounge_id, user_id, status, last_read_at)
SELECT r.id, (SELECT id FROM su_members WHERE n = 1), r.status, r.read_at FROM su_rooms r
ON CONFLICT (lounge_id, user_id) DO UPDATE SET status = EXCLUDED.status, last_read_at = EXCLUDED.last_read_at;

-- The words, each said at its own moment (the house's own writes keep their dates).
CREATE FUNCTION pg_temp.su_say(p_room text, p_writer integer, p_count integer, p_from interval) RETURNS void LANGUAGE sql AS $f$
  INSERT INTO public.lounge_messages (lounge_id, user_id, content, created_at)
  SELECT (SELECT id FROM su_rooms WHERE what = p_room), (SELECT id FROM su_members WHERE n = p_writer), 'rh su ' || g,
         now() - p_from + g * interval '1 second'
    FROM generate_series(1, p_count) g;
$f$;
SELECT pg_temp.su_say('never', 2, 150, interval '3 hours') AS done \gset rh_
SELECT pg_temp.su_say('since', 2, 40, interval '5 hours') AS done \gset rh_
SELECT pg_temp.su_say('since', 2, 7, interval '50 minutes') AS done \gset rh_
SELECT pg_temp.su_say('since', 1, 2, interval '40 minutes') AS done \gset rh_
SELECT pg_temp.su_say('since', 3, 3, interval '30 minutes') AS done \gset rh_
SELECT pg_temp.su_say('since', 4, 1, interval '20 minutes') AS done \gset rh_
-- Member 4's word carries member 3's, as a reply quoting it would: named as the house names it.
UPDATE public.lounge_messages SET carries_words_of = ARRAY[(SELECT id FROM su_members WHERE n = 3)]
 WHERE lounge_id = (SELECT id FROM su_rooms WHERE what = 'since') AND user_id = (SELECT id FROM su_members WHERE n = 4);
SELECT pg_temp.rh_need('a word carrying a hidden member''s', (SELECT count(*) FROM public.lounge_messages
  WHERE lounge_id = (SELECT id FROM su_rooms WHERE what = 'since') AND carries_words_of IS NOT NULL), 1) AS done \gset rh_
SELECT pg_temp.su_say('awaiting', 2, 5, interval '10 minutes') AS done \gset rh_
SELECT pg_temp.su_say('deep', 2, 3000, interval '1 day') AS done \gset rh_
SELECT pg_temp.su_say('crowded', 2, 120, interval '50 minutes') AS done \gset rh_
SELECT pg_temp.su_say('crowded', 1, 10, interval '10 minutes') AS done \gset rh_
SELECT pg_temp.rh_need('words planted', (SELECT count(*) FROM public.lounge_messages WHERE content LIKE 'rh su %'), 3338) AS done \gset rh_

-- Production's reading, as it was.
CREATE FUNCTION pg_temp.su_old() RETURNS TABLE(lounge_id uuid, unread_count bigint, last_message_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  WITH me AS (SELECT auth.uid() AS id, (SELECT private.hidden_authors()) AS hidden),
  rooms AS (
    SELECT lm.lounge_id, lm.last_read_at, (NOT l.is_private OR lm.status IN ('approved', 'muted')) AS readable
      FROM me
      JOIN public.lounge_members lm ON lm.user_id = me.id
      JOIN public.lounges l ON l.id = lm.lounge_id
  )
  SELECT
    r.lounge_id,
    CASE WHEN r.readable THEN (
      CASE WHEN r.last_read_at IS NULL THEN (
        SELECT count(*) FROM (
          SELECT 1 FROM public.lounge_messages m
           WHERE m.lounge_id = r.lounge_id
             AND m.user_id <> me.id
             AND NOT COALESCE(m.user_id = ANY (me.hidden), false)
             AND NOT COALESCE(m.carries_words_of && me.hidden, false)
           LIMIT 100
        ) unread
      ) ELSE (
        SELECT count(*) FROM (
          SELECT 1 FROM public.lounge_messages m
           WHERE m.lounge_id = r.lounge_id
             AND m.created_at > r.last_read_at
             AND m.user_id <> me.id
             AND NOT COALESCE(m.user_id = ANY (me.hidden), false)
             AND NOT COALESCE(m.carries_words_of && me.hidden, false)
           LIMIT 100
        ) unread
      ) END
    ) ELSE 0 END AS unread_count,
    CASE WHEN r.readable THEN (
      SELECT m.created_at FROM public.lounge_messages m
       WHERE m.lounge_id = r.lounge_id
         AND NOT COALESCE(m.user_id = ANY (me.hidden), false)
         AND (m.user_id = me.id OR NOT COALESCE(m.carries_words_of && me.hidden, false))
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT 1
    ) END AS last_message_at
  FROM rooms r CROSS JOIN me;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.su_old() TO authenticated;

-- What member 1 is told of each salon, by either reading.
CREATE TEMP TABLE su_told (how text, what text, unread bigint, last_word timestamptz) ON COMMIT DROP;
GRANT SELECT, INSERT ON su_told TO authenticated;
CREATE FUNCTION pg_temp.su_ask(p_old boolean) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE v_how text := CASE WHEN p_old THEN 'old' ELSE 'new' END;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT m.id FROM su_members m WHERE m.n = 1), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  IF p_old THEN
    INSERT INTO su_told SELECT v_how, r.what, u.unread_count, u.last_message_at FROM pg_temp.su_old() u JOIN su_rooms r ON r.id = u.lounge_id;
  ELSE
    INSERT INTO su_told SELECT v_how, r.what, u.unread_count, u.last_message_at FROM public.get_lounge_unread_counts() u JOIN su_rooms r ON r.id = u.lounge_id;
  END IF;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
END $f$;
SELECT pg_temp.su_ask(false) AS done \gset rh_
SELECT pg_temp.su_ask(true) AS done \gset rh_
SELECT pg_temp.rh_need('every salon told, by both readings', (SELECT count(*) FROM su_told), 10) AS done \gset rh_

CREATE FUNCTION pg_temp.su_said(p_how text, p_what text) RETURNS text LANGUAGE sql AS $f$
  SELECT coalesce((SELECT unread::text FROM su_told WHERE how = p_how AND what = p_what), 'untold')
$f$;
SELECT pg_temp.rh_case('the counts: never read, read before, awaiting, 3,000 since, crowded with the member''s own', '100|7|0|100|90',
  pg_temp.su_said('new', 'never') || '|' || pg_temp.su_said('new', 'since') || '|' || pg_temp.su_said('new', 'awaiting') || '|'
    || pg_temp.su_said('new', 'deep') || '|' || pg_temp.su_said('new', 'crowded')) AS done \gset rh_
SELECT pg_temp.rh_case('every salon but the crowded one is told as production told it, its count and its last word', 'none',
  coalesce((SELECT string_agg(n.what, ', ' ORDER BY n.what) FROM su_told n JOIN su_told o ON o.what = n.what AND o.how = 'old'
             WHERE n.how = 'new' AND n.what <> 'crowded' AND (n.unread, n.last_word) IS DISTINCT FROM (o.unread, o.last_word)), 'none')) AS done \gset rh_
SELECT pg_temp.rh_case('the crowded salon: production counted past the member''s own; its last word the same', '100|true',
  pg_temp.su_said('old', 'crowded') || '|'
    || ((SELECT last_word FROM su_told WHERE how = 'new' AND what = 'crowded') = (SELECT last_word FROM su_told WHERE how = 'old' AND what = 'crowded'))::text) AS done \gset rh_
-- On a sealed copy alone (plan_checks, which e2e/db/rehearsals.mjs sets): a plan is chosen by statistics,
-- and a copy of production carries its rows without them; the Load's plan guards hold the bound at size.
\if :{?plan_checks}
-- The rows the salons' index returns to member 1's reading alone. Five salons: four read (the awaited one
-- is not), at most a hundred each, and each one's last word.
CREATE FUNCTION pg_temp.su_index_rows() RETURNS bigint LANGUAGE plpgsql AS $f$
DECLARE v_before bigint; v_rows bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT m.id FROM su_members m WHERE m.n = 1), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_before := pg_stat_get_xact_tuples_returned('public.lounge_messages_room_newest'::regclass);
  PERFORM count(*) FROM public.get_lounge_unread_counts();
  v_rows := pg_stat_get_xact_tuples_returned('public.lounge_messages_room_newest'::regclass) - v_before;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v_rows;
END $f$;
SELECT pg_temp.rh_case('the read reads at most a hundred and a few of the index''s rows a salon, 3,000 waiting in one', 'true',
  ((SELECT pg_temp.su_index_rows()) <= 5 * 110)::text) AS done \gset rh_
\endif
SELECT pg_temp.rh_case('each salon''s hundred is read from the front of its index, the plan held, the hidden asked as a set', 'true|true',
  (position('NOT IN (SELECT h.u FROM hidden h)' in pg_get_functiondef('public.get_lounge_unread_counts()'::regprocedure)) > 0
     AND position('ORDER BY m.created_at DESC, m.id DESC
           LIMIT 100' in pg_get_functiondef('public.get_lounge_unread_counts()'::regprocedure)) > 0)::text || '|'
    || coalesce((SELECT 'enable_bitmapscan=off' = ANY (proconfig) FROM pg_proc WHERE oid = 'public.get_lounge_unread_counts()'::regprocedure), false)::text) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
