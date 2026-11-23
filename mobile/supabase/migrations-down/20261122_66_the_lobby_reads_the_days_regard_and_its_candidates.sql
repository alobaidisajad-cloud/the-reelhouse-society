-- Undo of 20261122_66: the Lobby's edition chosen in one transaction by the hourly job, as production held it.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- add-only (3): it only fixes: as production held it
CREATE OR REPLACE FUNCTION public.lobby_choose_edition(p_edition date DEFAULT ((now() AT TIME ZONE 'UTC'::text))::date) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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
$$;

-- The hourly job chooses the day's edition itself again; a draft left half drawn up is chosen whole by its next run.
DO $$
BEGIN
  IF to_regprocedure('cron.schedule(text,text,text)') IS NOT NULL THEN
    PERFORM cron.schedule('lobby-edition', '5 * * * *', 'SELECT public.lobby_choose_edition();');
  END IF;
  IF to_regclass('cron.job') IS NOT NULL THEN
    PERFORM cron.unschedule(j.jobid) FROM cron.job j WHERE j.jobname = 'the-lobby-edition-is-drafted';
  END IF;
END $$;
-- add-only (1): no shipped client uses it: the functions this car made, in private
DROP FUNCTION IF EXISTS private.lobby_edition_drafted(integer);
-- add-only (1): no shipped client uses it: the functions this car made, in private
DROP FUNCTION IF EXISTS private.lobby_edition_begun();
-- add-only (1): no shipped client uses it: the functions this car made, in private
DROP FUNCTION IF EXISTS private.lobby_edition_step(date, integer);
-- add-only (1): no shipped client uses it: the drafts this car made, in private
DROP TABLE IF EXISTS private.lobby_draft_pieces, private.lobby_draft_candidates, private.lobby_draft_regard, private.lobby_drafts;
