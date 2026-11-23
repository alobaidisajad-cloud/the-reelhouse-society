-- ════════════════════════════════════════════════════════════════════════════
-- the_lobby_reads_the_days_regard_and_its_candidates_rehearsal.sql — 20261122_66. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs the_lobby_reads_the_days_regard_and_its_candidates_rehearsal.sql --with-train
--
-- The train applies 20261122_66 here (with_train), every car before it already applied; a sealed copy
-- already holds it. The house's own record set aside (rolled back), four members file logs, stacks and
-- filings just before today's edition and mark them: certified by two, by a banned member alone, critiqued
-- twice by one, a critique the house withheld, a private stack, an unmarked newest piece. Today's edition
-- is then chosen three ways, each undone after: by the chooser as production held it (copied here), by the
-- chooser called by itself, and drawn up by the schedule's job two rows a step. The three give the same
-- places and the same notices; the job takes more steps than a draft has stages, and leaves the schedule
-- once nothing is drafted; the hourly lobby-edition job begins the draft and puts its job on the schedule;
-- no member reads a draft.
-- Every row here is undone with the transaction. Read each NOTICE as  case|expected|got ; the last line
-- is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

\if :{?with_train}
\ir ../../../supabase/migrations/20261122_66_the_lobby_reads_the_days_regard_and_its_candidates.sql
\endif
RESET ROLE;

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
CREATE TEMP TABLE lr_cast ON COMMIT DROP AS
  SELECT id, (ARRAY['author', 'reader', 'critic', 'banned'])[row_number() OVER (ORDER BY created_at)] AS part
    FROM (SELECT u.id, u.created_at FROM auth.users u JOIN public.profiles p ON p.id = u.id
           WHERE coalesce(p.role, '') <> 'admin' AND NOT coalesce(p.is_banned, false)
             AND NOT coalesce(p.is_social_private, false)
           ORDER BY u.created_at LIMIT 4) m;
SELECT pg_temp.rh_need('four members who are not admins, banned or private', (SELECT count(*) FROM lr_cast), 4) AS done \gset rh_
GRANT SELECT ON lr_cast TO authenticated;
DELETE FROM public.user_blocks WHERE blocker_id IN (SELECT id FROM lr_cast) AND blocked_id IN (SELECT id FROM lr_cast);
-- The edition of 2 January 2001: its moment 00:00 UTC; everything below made in the minutes before it. A day
-- before the house's first piece, so the only pieces older than the edition are the ones made here: the chooser
-- as production held it reads every piece older than its edition (load 45122008179: past 30 s at 500,000
-- members, under the car's locks), and here it reads these alone, as the new chooser does.
CREATE TEMP TABLE lr_clock ON COMMIT DROP AS
  SELECT date '2001-01-02' AS today, (date '2001-01-02')::timestamp AT TIME ZONE 'UTC' AS moment;
SELECT pg_temp.rh_case('no record of the house is older than the edition', '0', (SELECT count(*) FROM public.logs WHERE created_at < (SELECT moment FROM lr_clock))::text) AS done \gset rh_
-- The house's own record set aside: the only honours and Lobby notices are the ones made here.
DELETE FROM public.notifications WHERE type = 'featured';
DELETE FROM public.lobby_editions;
DELETE FROM private.lobby_drafts;

INSERT INTO public.logs (id, user_id, film_id, film_title, review, is_spoiler, rating, status, watched_date, created_at)
SELECT v.id::uuid, (SELECT id FROM lr_cast WHERE part = v.who), 990600 + right(v.id, 2)::int, 'Paris, Texas', v.review, false, 4, 'watched',
       ((SELECT moment FROM lr_clock) - (v.mins || ' minutes')::interval)::date, (SELECT moment FROM lr_clock) - (v.mins || ' minutes')::interval
  FROM (VALUES
    ('10bb1e66-0000-4000-8000-000000000001', 'author', 'Two members certified this, at some length.', 10),
    ('10bb1e66-0000-4000-8000-000000000002', 'author', 'A banned member certified this one alone.', 11),
    ('10bb1e66-0000-4000-8000-000000000003', 'author', 'Critiqued twice by one member, certified by one.', 12),
    ('10bb1e66-0000-4000-8000-000000000004', 'reader', 'Unmarked, and the newest of them all here.', 1)
  ) AS v(id, who, review, mins);
INSERT INTO public.interactions (user_id, type, target_log_id, created_at)
SELECT (SELECT id FROM lr_cast WHERE part = v.who), 'endorse_log', v.log::uuid, (SELECT moment FROM lr_clock) - (v.mins || ' minutes')::interval
  FROM (VALUES ('reader', '10bb1e66-0000-4000-8000-000000000001', 5), ('critic', '10bb1e66-0000-4000-8000-000000000001', 6),
               ('banned', '10bb1e66-0000-4000-8000-000000000002', 7), ('reader', '10bb1e66-0000-4000-8000-000000000003', 8)) AS v(who, log, mins);
INSERT INTO public.log_comments (log_id, user_id, username, body, created_at, withheld_at)
SELECT v.log::uuid, (SELECT id FROM lr_cast WHERE part = v.who), 'rehearsal', 'A critique.',
       (SELECT moment FROM lr_clock) - (v.mins || ' minutes')::interval, v.withheld
  FROM (VALUES ('critic', '10bb1e66-0000-4000-8000-000000000003', 3, NULL::timestamptz),
               ('critic', '10bb1e66-0000-4000-8000-000000000003', 4, NULL),
               ('critic', '10bb1e66-0000-4000-8000-000000000004', 2, now())) AS v(who, log, mins, withheld);
INSERT INTO public.lists (id, user_id, title, is_private, created_at)
SELECT v.id::uuid, (SELECT id FROM lr_cast WHERE part = 'author'), v.title, v.private, (SELECT moment FROM lr_clock) - (v.mins || ' minutes')::interval
  FROM (VALUES ('10bb1e66-0000-4000-8000-0000000000a1', 'Four films', false, 20),
               ('10bb1e66-0000-4000-8000-0000000000a2', 'Kept private', true, 21),
               ('10bb1e66-0000-4000-8000-0000000000a3', 'Marked neither way', NULL::boolean, 22)) AS v(id, title, private, mins);
INSERT INTO public.list_items (list_id, film_id, film_title, rank_position)
SELECT s.id::uuid, 990700 + n, 'Paris, Texas', n
  FROM (VALUES ('10bb1e66-0000-4000-8000-0000000000a1'), ('10bb1e66-0000-4000-8000-0000000000a2'), ('10bb1e66-0000-4000-8000-0000000000a3')) AS s(id),
       generate_series(1, 4) n;
INSERT INTO public.interactions (user_id, type, target_list_id, created_at)
SELECT (SELECT id FROM lr_cast WHERE part = v.who), 'endorse_list', v.list::uuid, (SELECT moment FROM lr_clock) - interval '15 minutes'
  FROM (VALUES ('reader', '10bb1e66-0000-4000-8000-0000000000a1'), ('reader', '10bb1e66-0000-4000-8000-0000000000a2'),
               ('critic', '10bb1e66-0000-4000-8000-0000000000a2')) AS v(who, list);
INSERT INTO public.dispatch_posts (id, kind, user_id, author_username, body, is_published, created_at)
SELECT v.id::uuid, 'take', (SELECT id FROM lr_cast WHERE part = v.who), 'rehearsal', v.body, true, (SELECT moment FROM lr_clock) - (v.mins || ' minutes')::interval
  FROM (VALUES ('10bb1e66-0000-4000-8000-0000000000b1', 'author', 'A take certified by two members, at length.', 30),
               ('10bb1e66-0000-4000-8000-0000000000b2', 'reader', 'Another take, unmarked, said at some length.', 31)) AS v(id, who, body, mins);
INSERT INTO public.dispatch_certifications (user_id, post_id, created_at)
SELECT (SELECT id FROM lr_cast WHERE part = v.who), v.post::uuid, (SELECT moment FROM lr_clock) - interval '25 minutes'
  FROM (VALUES ('reader', '10bb1e66-0000-4000-8000-0000000000b1'), ('critic', '10bb1e66-0000-4000-8000-0000000000b1')) AS v(who, post);
INSERT INTO public.dispatch_comments (post_id, user_id, author_username, body, created_at)
SELECT '10bb1e66-0000-4000-8000-0000000000b1', id, 'rehearsal', 'A critique.', (SELECT moment FROM lr_clock) - interval '24 minutes'
  FROM lr_cast WHERE part = 'critic';
-- Only now is the banned member banned (their mark was made before).
UPDATE public.profiles SET is_banned = true WHERE id = (SELECT id FROM lr_cast WHERE part = 'banned');

-- The chooser as production held it, for the old reading.
CREATE FUNCTION pg_temp.lr_old_choose(p_edition date) RETURNS integer LANGUAGE plpgsql AS $old$
DECLARE
  -- the edition's moment: 00:00 UTC of its day; its regard is the day before it
  v_end   timestamptz := p_edition::timestamp AT TIME ZONE 'UTC';
  v_start timestamptz := (p_edition::timestamp AT TIME ZONE 'UTC') - interval '1 day';
  v_chosen integer;
BEGIN
  -- One chooser at a time; and an edition, once chosen, is never chosen again.
  PERFORM pg_advisory_xact_lock(hashtext('public.lobby_choose_edition'));
  IF EXISTS (SELECT 1 FROM public.lobby_editions WHERE edition = p_edition) THEN
    RETURN 0;
  END IF;

  WITH regard AS (
    -- who marked what in the day before, and how: 'c' certified, 'q' critiqued; never its author
    SELECT 'log'::text AS slot, x.target_log_id AS target, x.user_id AS member, 'c' AS how
      FROM public.interactions x JOIN public.logs l ON l.id = x.target_log_id
     WHERE x.type = 'endorse_log' AND x.user_id <> l.user_id AND x.created_at >= v_start AND x.created_at < v_end
    UNION ALL
    SELECT 'log', c.log_id, c.user_id, 'q'
      FROM public.log_comments c JOIN public.logs l ON l.id = c.log_id
     WHERE c.user_id IS NOT NULL AND c.user_id <> l.user_id AND c.created_at >= v_start AND c.created_at < v_end
       AND c.withheld_at IS NULL  -- a critique the house withholds is no regard (H-B10)
    UNION ALL
    SELECT 'list', x.target_list_id, x.user_id, 'c'
      FROM public.interactions x JOIN public.lists s ON s.id = x.target_list_id
     WHERE x.type = 'endorse_list' AND x.user_id <> s.user_id AND x.created_at >= v_start AND x.created_at < v_end
    UNION ALL
    SELECT 'list', c.list_id, c.user_id, 'q'
      FROM public.list_comments c JOIN public.lists s ON s.id = c.list_id
     WHERE c.user_id IS NOT NULL AND c.user_id <> s.user_id AND c.created_at >= v_start AND c.created_at < v_end
       AND c.withheld_at IS NULL  -- (H-B10)
    UNION ALL
    SELECT 'post', c.post_id, c.user_id, 'c'
      FROM public.dispatch_certifications c JOIN public.dispatch_posts d ON d.id = c.post_id
     WHERE c.post_id IS NOT NULL AND c.user_id <> d.user_id AND c.created_at >= v_start AND c.created_at < v_end
    UNION ALL
    SELECT 'post', c.post_id, c.user_id, 'q'
      FROM public.dispatch_comments c JOIN public.dispatch_posts d ON d.id = c.post_id
     WHERE c.user_id IS NOT NULL AND c.user_id <> d.user_id AND c.created_at >= v_start AND c.created_at < v_end
       AND c.withheld_at IS NULL  -- (H-B10)
  ),
  counted AS (
    -- a banned member's regard counts for nothing
    SELECT r.slot, r.target, count(DISTINCT r.how || r.member::text) AS day
      FROM regard r
      JOIN public.profiles m ON m.id = r.member
     WHERE NOT coalesce(m.is_banned, false)
     GROUP BY r.slot, r.target
  ),
  -- what the wall has shown before: first log, first stack, first three filings
  honoured AS (
    SELECT e.slot, e.target_id, e.author_id, e.edition
      FROM public.lobby_editions e
     WHERE e.edition < p_edition AND e.place <= CASE e.slot WHEN 'post' THEN 3 ELSE 1 END
  ),
  -- the pieces that may hang (the counted ones, and the newest, which a quiet day reaches)
  able AS (
    SELECT 'log'::text AS slot, l.id, l.user_id AS author, l.created_at
      FROM public.logs l JOIN public.profiles p ON p.id = l.user_id
     WHERE btrim(coalesce(l.review, '')) <> '' AND NOT coalesce(l.is_spoiler, false)
       AND l.withheld_at IS NULL  -- a piece the house withholds never hangs (H-B10)
       AND l.created_at < v_end
       AND NOT coalesce(p.is_banned, false) AND NOT coalesce(p.is_social_private, false)
       AND NOT EXISTS (SELECT 1 FROM public.lobby_withheld w WHERE w.kind = 'log' AND w.target_id = l.id)
       AND NOT EXISTS (SELECT 1 FROM public.reports r WHERE r.content_type = 'log' AND r.content_id = l.id::text
                                                        AND coalesce(r.status, 'pending') = 'pending')
       AND (l.id IN (SELECT target FROM counted WHERE slot = 'log')
            OR l.id IN (SELECT n.id FROM public.logs n
                          JOIN public.profiles np ON np.id = n.user_id
                         WHERE char_length(btrim(coalesce(n.review, ''))) >= 30 AND NOT coalesce(n.is_spoiler, false)
                           AND n.created_at < v_end
                           AND NOT coalesce(np.is_banned, false) AND NOT coalesce(np.is_social_private, false)
                           AND NOT EXISTS (SELECT 1 FROM honoured h WHERE h.slot = 'log' AND h.target_id = n.id)
                         ORDER BY n.created_at DESC LIMIT 24)
            OR l.id IN (SELECT target_id FROM honoured WHERE slot = 'log'))
    UNION ALL
    SELECT 'list', s.id, s.user_id, s.created_at
      FROM public.lists s JOIN public.profiles p ON p.id = s.user_id
     WHERE NOT coalesce(s.is_private, false)
       AND s.withheld_at IS NULL  -- a piece the house withholds never hangs (H-B10)
       AND (SELECT count(*) FROM public.list_items i WHERE i.list_id = s.id) >= 4
       AND s.created_at < v_end
       AND NOT coalesce(p.is_banned, false) AND NOT coalesce(p.is_social_private, false)
       AND NOT EXISTS (SELECT 1 FROM public.lobby_withheld w WHERE w.kind = 'list' AND w.target_id = s.id)
       AND NOT EXISTS (SELECT 1 FROM public.reports r WHERE r.content_type = 'list' AND r.content_id = s.id::text
                                                        AND coalesce(r.status, 'pending') = 'pending')
       AND (s.id IN (SELECT target FROM counted WHERE slot = 'list')
            OR s.id IN (SELECT n.id FROM public.lists n
                          JOIN public.profiles np ON np.id = n.user_id
                         WHERE NOT coalesce(n.is_private, false) AND n.created_at < v_end
                           AND (SELECT count(*) FROM public.list_items i WHERE i.list_id = n.id) >= 4
                           AND NOT coalesce(np.is_banned, false) AND NOT coalesce(np.is_social_private, false)
                           AND NOT EXISTS (SELECT 1 FROM honoured h WHERE h.slot = 'list' AND h.target_id = n.id)
                         ORDER BY n.created_at DESC LIMIT 24)
            OR s.id IN (SELECT target_id FROM honoured WHERE slot = 'list'))
    UNION ALL
    SELECT 'post', d.id, d.user_id, d.created_at
      FROM public.dispatch_posts d JOIN public.profiles p ON p.id = d.user_id
     WHERE coalesce(d.is_published, false) AND d.withheld_at IS NULL AND d.ended_at IS NULL
       AND d.spoiler_label IS NULL AND d.created_at < v_end
       AND NOT coalesce(p.is_banned, false) AND NOT coalesce(p.is_social_private, false)
       AND NOT EXISTS (SELECT 1 FROM public.lobby_withheld w WHERE w.kind = 'post' AND w.target_id = d.id)
       AND NOT EXISTS (SELECT 1 FROM public.reports r WHERE r.content_type = 'dispatch_post' AND r.content_id = d.id::text
                                                        AND coalesce(r.status, 'pending') = 'pending')
       AND (d.id IN (SELECT target FROM counted WHERE slot = 'post')
            OR d.id IN (SELECT n.id FROM public.dispatch_posts n
                          JOIN public.profiles np ON np.id = n.user_id
                         WHERE coalesce(n.is_published, false) AND n.withheld_at IS NULL AND n.ended_at IS NULL
                           AND n.spoiler_label IS NULL AND n.created_at < v_end
                           AND char_length(btrim(coalesce(n.title, '') || ' ' || coalesce(nullif(n.full_content, ''), n.body, ''))) >= 30
                           AND NOT coalesce(np.is_banned, false) AND NOT coalesce(np.is_social_private, false)
                           AND NOT EXISTS (SELECT 1 FROM honoured h WHERE h.slot = 'post' AND h.target_id = n.id)
                         ORDER BY n.created_at DESC LIMIT 24)
            OR d.id IN (SELECT target_id FROM honoured WHERE slot = 'post'))
  ),
  scored AS (
    SELECT a.slot, a.id, a.author, a.created_at, coalesce(c.day, 0) AS day,
           EXISTS (SELECT 1 FROM honoured h WHERE h.slot = a.slot AND h.target_id = a.id) AS had_its_day,
           EXISTS (SELECT 1 FROM honoured h WHERE h.author_id = a.author AND h.edition >= p_edition - 7) AS honoured_lately
      FROM able a LEFT JOIN counted c ON c.slot = a.slot AND c.target = a.id
  ),
  ranked AS (
    SELECT s.*,
           row_number() OVER (PARTITION BY s.slot
                              ORDER BY s.had_its_day, s.day DESC, s.honoured_lately,
                                       s.created_at DESC, s.id) AS merit
      FROM scored s
  ),
  -- one member, one bill: each author's second piece in a slot, and the first log's author among stacks
  spread AS (
    SELECT r.*,
           row_number() OVER (PARTITION BY r.slot, r.author ORDER BY r.merit) AS nth,
           (r.slot = 'list' AND r.author = (SELECT author FROM ranked WHERE slot = 'log' AND merit = 1)) AS holds_the_log
      FROM ranked r
  ),
  placed AS (
    SELECT s.slot, s.id, s.author, s.day,
           row_number() OVER (PARTITION BY s.slot
                              ORDER BY s.holds_the_log, (s.slot = 'post' AND s.nth > 1), s.merit) AS place
      FROM spread s
  )
  INSERT INTO public.lobby_editions (edition, slot, place, target_id, author_id, score)
  SELECT p_edition, slot, place, id, author, day FROM placed WHERE place <= 12;

  GET DIAGNOSTICS v_chosen = ROW_COUNT;

  -- The authors of what hangs are told without a push — once a piece, never again.
  INSERT INTO public.notifications (user_id, type, message, group_key)
  SELECT e.author_id, 'featured',
         CASE e.slot WHEN 'log'  THEN 'Your log hangs in the Lobby today.'
                     WHEN 'list' THEN 'Your stack hangs in the Lobby today.'
                     ELSE             'Your filing hangs in the Lobby today.' END,
         'lobby:' || e.slot || ':' || e.target_id
    FROM public.lobby_editions e
   WHERE e.edition = p_edition
     AND e.place <= CASE e.slot WHEN 'post' THEN 3 ELSE 1 END
     AND NOT EXISTS (SELECT 1 FROM public.notifications n
                      WHERE n.type = 'featured' AND n.group_key = 'lobby:' || e.slot || ':' || e.target_id);

  RETURN v_chosen;
END;
$old$;
-- A job on the schedule, as its pace and command; 'no jobs' where the house keeps none, 'none' when it is not there.
CREATE FUNCTION pg_temp.lr_job(p_name text) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE v text;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN RETURN 'no jobs'; END IF;
  EXECUTE 'SELECT string_agg(j.schedule || '' '' || j.command, '', '') FROM cron.job j WHERE j.jobname = $1' INTO v USING p_name;
  RETURN coalesce(v, 'none');
END $f$;
-- The edition and its notices, as one line: each place, then each Lobby notice.
CREATE FUNCTION pg_temp.lr_edition(p_edition date) RETURNS text LANGUAGE sql AS $f$
  SELECT coalesce((SELECT string_agg(e.slot || e.place || ':' || e.target_id || ':' || e.author_id || ':' || e.score, ' ' ORDER BY e.slot, e.place)
                     FROM public.lobby_editions e WHERE e.edition = p_edition), 'no places') || ' | '
      || coalesce((SELECT string_agg(n.user_id || ':' || n.message || ':' || n.group_key, ' ' ORDER BY n.group_key)
                     FROM public.notifications n WHERE n.type = 'featured'), 'no notices')
$f$;

-- 1. As production chose it.
SAVEPOINT lr_choice;
SELECT pg_temp.lr_old_choose((SELECT today FROM lr_clock)) AS done \gset rh_
SELECT pg_temp.lr_edition((SELECT today FROM lr_clock)) AS old_edition \gset lr_
ROLLBACK TO SAVEPOINT lr_choice;

-- 2. The chooser called by itself.
SAVEPOINT lr_choice;
SELECT public.lobby_choose_edition((SELECT today FROM lr_clock)) AS done \gset rh_
SELECT pg_temp.lr_edition((SELECT today FROM lr_clock)) AS called_edition \gset lr_
ROLLBACK TO SAVEPOINT lr_choice;

-- 3. Drawn up by the schedule's job, two rows a step.
SAVEPOINT lr_choice;
INSERT INTO private.lobby_drafts (edition) SELECT today FROM lr_clock;
CREATE TEMP TABLE lr_steps (n integer, said text);
DO $$
DECLARE k integer := 0;
BEGIN
  WHILE EXISTS (SELECT 1 FROM private.lobby_drafts) AND k < 10000 LOOP
    k := k + 1;
    INSERT INTO lr_steps VALUES (k, private.lobby_edition_drafted(2));
  END LOOP;
  INSERT INTO lr_steps VALUES (k + 1, private.lobby_edition_drafted(2));
END $$;
SELECT pg_temp.lr_edition((SELECT today FROM lr_clock)) AS drafted_edition \gset lr_
SELECT (SELECT count(*) FROM lr_steps WHERE said NOT IN ('none drafted', 'waited')) || '|' || (SELECT said FROM lr_steps ORDER BY n DESC LIMIT 1)
       || '|' || (pg_temp.lr_job('the-lobby-edition-is-drafted') IN ('no jobs', 'none'))::text AS drafted_steps \gset lr_
ROLLBACK TO SAVEPOINT lr_choice;

SELECT pg_temp.rh_case('the edition places pieces and tells their authors', 'true',
  (:'lr_old_edition' NOT LIKE 'no places%' AND :'lr_old_edition' NOT LIKE '%| no notices')::text) AS done \gset rh_
SELECT pg_temp.rh_case('the chooser called by itself chooses the edition production chose', :'lr_old_edition', :'lr_called_edition') AS done \gset rh_
SELECT pg_temp.rh_case('the job, a short step at a time, draws up the edition production chose', :'lr_old_edition', :'lr_drafted_edition') AS done \gset rh_
SELECT pg_temp.rh_case('the job takes more steps than a draft has stages, and leaves the schedule once nothing is drafted', 'true|none drafted|true',
  (split_part(:'lr_drafted_steps', '|', 1)::integer > 9)::text || '|' || split_part(:'lr_drafted_steps', '|', 2) || '|' || split_part(:'lr_drafted_steps', '|', 3)) AS done \gset rh_

-- The hourly job begins today's draft and puts its job on the schedule, where the house keeps its jobs.
SELECT private.lobby_edition_begun() AS begun \gset lr_
SELECT pg_temp.rh_case('the hourly lobby-edition job begins the day''s draft, and its job is put on the schedule', 'drafted|true|true|true',
  :'lr_begun' || '|'
  || (EXISTS (SELECT 1 FROM private.lobby_drafts d WHERE d.edition = (now() AT TIME ZONE 'UTC')::date))::text || '|'
  || (pg_temp.lr_job('the-lobby-edition-is-drafted') IN ('no jobs', '1 seconds SELECT private.lobby_edition_drafted();'))::text || '|'
  || (pg_temp.lr_job('lobby-edition') IN ('no jobs', '5 * * * * SELECT private.lobby_edition_begun();'))::text) AS done \gset rh_

-- No member reads a draft.
CREATE FUNCTION pg_temp.lr_member_reads() RETURNS text LANGUAGE plpgsql AS $f$
DECLARE v text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT c.id FROM lr_cast c WHERE c.part = 'reader'), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  BEGIN
    PERFORM count(*) FROM private.lobby_draft_regard;
    v := 'read';
  EXCEPTION WHEN insufficient_privilege THEN v := 'refused';
  END;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v;
END $f$;
SELECT pg_temp.rh_case('no member reads a draft', 'refused', (SELECT pg_temp.lr_member_reads())) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
