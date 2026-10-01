-- ════════════════════════════════════════════════════════════════════════════
-- 20261001_01 — the Lobby turns every day: an honour is a piece's moment
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── WHAT 20260930_03 DID, AND WHERE IT FELL SHORT ────────────────────────
-- It ranked by regard in the 24 hours before the edition, then broke ties by
-- the week, the month and all time. In a quiet house nobody marks anything in
-- a day, so the all-time winners won every day: the second edition was the
-- first again, and its authors were told again — an honour that arrives daily
-- is no honour.
--
-- ── THE ORDER OF HONOUR NOW, for every slot alike ─────────────────────────
--   1. a piece never honoured before comes first. A piece's Lobby honour is
--      ITS day: one that has had it returns only when the house has nothing
--      new to hang (so the wall is never a hole), and is never told twice;
--   2. then the members, OTHER than its author, who certified or critiqued it
--      in the 24 hours before the edition — each counted once for certifying
--      and once for critiquing, a banned member not at all. Nothing older
--      counts: an all-time favourite would hang for ever;
--   3. then a member not honoured in the past week before one who was, so on
--      a quiet day the honour goes round the house, not to whoever posts most;
--   4. then the newest; then its id, so the choice is the same however often
--      it is asked.
--
-- ── WHAT MAY HANG, BESIDES 20260930_03's RULES ────────────────────────────
-- A QUIET DAY HANGS NOTHING THROWAWAY: a piece nobody marked hangs by being
-- new, so it must have something to say — 30 characters or more ("..",
-- "123" and a seven-letter slur were all live reviews). A piece other members
-- certified or critiqued has earned its place at any length.
-- NOTHING AWAITING A MODERATOR: a piece with a report not yet decided is not
-- chosen; once it is cleared it may hang again.
--
-- ── AND ON ONE WALL ───────────────────────────────────────────────────────
-- One member, one bill: the first stack is another member's when the first
-- log is theirs, and the three filings come from three writers wherever three
-- have filed. Both are preferences, never holes: a slot with nothing else to
-- show shows what it has. get_lobby keeps both for each reader too, whose
-- rules and blocks may skip the piece the house put first.
--
-- "Honoured" means hung where the wall shows it: first among logs and among
-- stacks, the first three filings — as the notice and the page's honour do.
--
-- TODAY'S edition was chosen under the old order: it is chosen again under
-- this one, and the notices it sent for pieces honoured on an earlier day are
-- taken back (each piece is told once).
--
-- No transaction control here: the rehearsal
-- (mobile/supabase/diagnostics/the_lobby_wall_rehearsal.sql) includes this file
-- inside its own transaction.
-- ════════════════════════════════════════════════════════════════════════════

-- ── CHOOSING AN EDITION ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.lobby_choose_edition(p_edition date DEFAULT ((now() AT TIME ZONE 'UTC')::date))
    RETURNS integer
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
    UNION ALL
    SELECT 'list', x.target_list_id, x.user_id, 'c'
      FROM public.interactions x JOIN public.lists s ON s.id = x.target_list_id
     WHERE x.type = 'endorse_list' AND x.user_id <> s.user_id AND x.created_at >= v_start AND x.created_at < v_end
    UNION ALL
    SELECT 'list', c.list_id, c.user_id, 'q'
      FROM public.list_comments c JOIN public.lists s ON s.id = c.list_id
     WHERE c.user_id IS NOT NULL AND c.user_id <> s.user_id AND c.created_at >= v_start AND c.created_at < v_end
    UNION ALL
    SELECT 'post', c.post_id, c.user_id, 'c'
      FROM public.dispatch_certifications c JOIN public.dispatch_posts d ON d.id = c.post_id
     WHERE c.post_id IS NOT NULL AND c.user_id <> d.user_id AND c.created_at >= v_start AND c.created_at < v_end
    UNION ALL
    SELECT 'post', c.post_id, c.user_id, 'q'
      FROM public.dispatch_comments c JOIN public.dispatch_posts d ON d.id = c.post_id
     WHERE c.user_id IS NOT NULL AND c.user_id <> d.user_id AND c.created_at >= v_start AND c.created_at < v_end
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

COMMENT ON FUNCTION public.lobby_choose_edition(date) IS
  'Chooses the Lobby''s edition for a day, once: the never-honoured first, by the day''s regard, the honour spread round the house. Run by the lobby-edition job; no role may call it.';

REVOKE ALL ON FUNCTION public.lobby_choose_edition(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lobby_choose_edition(date) FROM anon, authenticated;

-- ── READING THE WALL ────────────────────────────────────────────────────────
-- As 20260930_03, and for each reader one member, one bill: their first stack
-- is another member's than their first log's where one may be shown, and
-- their filings come from different writers before any writer twice.
CREATE OR REPLACE FUNCTION public.get_lobby() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY INVOKER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  WITH ed AS (
    SELECT max(edition) AS edition FROM public.lobby_editions
     WHERE edition <= (now() AT TIME ZONE 'UTC')::date
  ),
  the_log AS (
    SELECT l.id, l.review, l.rating, l.film_id, l.film_title, l.poster_path,
           p.id AS author_id, p.username, p.avatar_url, p.role, p.tier, p.is_founding
      FROM ed
      JOIN public.lobby_editions e ON e.edition = ed.edition AND e.slot = 'log'
      JOIN public.logs l ON l.id = e.target_id
      JOIN public.profiles p ON p.id = l.user_id
     WHERE btrim(coalesce(l.review, '')) <> '' AND NOT coalesce(l.is_spoiler, false)
       AND NOT coalesce(p.is_banned, false)
       AND NOT public.is_hidden_by(auth.uid(), l.user_id)
     ORDER BY e.place
     LIMIT 1
  ),
  the_stack AS (
    SELECT s.id, s.title, s.description,
           p.id AS author_id, p.username, p.avatar_url, p.role, p.tier, p.is_founding
      FROM ed
      JOIN public.lobby_editions e ON e.edition = ed.edition AND e.slot = 'list'
      JOIN public.lists s ON s.id = e.target_id
      JOIN public.profiles p ON p.id = s.user_id
     WHERE NOT coalesce(s.is_private, false)
       AND (SELECT count(*) FROM public.list_items i WHERE i.list_id = s.id) >= 4
       AND NOT coalesce(p.is_banned, false)
       AND NOT public.is_hidden_by(auth.uid(), s.user_id)
     ORDER BY (s.user_id = (SELECT author_id FROM the_log)) IS TRUE, e.place
     LIMIT 1
  ),
  the_filings AS (
    SELECT f.* FROM (
      SELECT d.id, d.kind, d.title,
             left(coalesce(nullif(d.full_content, ''), d.body, ''), 1500) AS text,
             coalesce(array_length(regexp_split_to_array(btrim(coalesce(nullif(d.full_content, ''), d.body, '')), '\s+'), 1), 0) AS words,
             p.id AS author_id, p.username, p.avatar_url, p.role, p.tier, p.is_founding,
             e.place,
             row_number() OVER (PARTITION BY d.user_id ORDER BY e.place) AS nth
        FROM ed
        JOIN public.lobby_editions e ON e.edition = ed.edition AND e.slot = 'post'
        JOIN public.dispatch_posts d ON d.id = e.target_id
        JOIN public.profiles p ON p.id = d.user_id
       -- asked here, not left to the rules: an author reads their own withheld or drawn-back filing
       WHERE coalesce(d.is_published, false) AND d.withheld_at IS NULL
         AND d.ended_at IS NULL AND d.spoiler_label IS NULL
         AND NOT coalesce(p.is_banned, false)
    ) f
    ORDER BY f.nth > 1, f.place
    LIMIT 3
  )
  SELECT jsonb_build_object(
    'edition', (SELECT edition FROM ed),
    'log', (SELECT jsonb_build_object(
              'id', l.id, 'words', l.review, 'rating', l.rating,
              'film', jsonb_build_object('id', l.film_id, 'title', l.film_title, 'poster_path', l.poster_path),
              'author', jsonb_build_object('id', l.author_id, 'username', l.username, 'avatar_url', l.avatar_url,
                                           'role', l.role, 'tier', l.tier, 'is_founding', l.is_founding))
              FROM the_log l),
    'stack', (SELECT jsonb_build_object(
              'id', s.id, 'title', s.title, 'description', s.description,
              'films', (SELECT count(*) FROM public.list_items i WHERE i.list_id = s.id),
              'posters', coalesce((SELECT jsonb_agg(jsonb_build_object('film_id', f.film_id, 'title', f.film_title, 'poster_path', f.poster_path)
                                                    ORDER BY f.rank_position)
                                     FROM (SELECT film_id, film_title, poster_path, rank_position FROM public.list_items
                                            WHERE list_id = s.id ORDER BY rank_position LIMIT 3) f), '[]'::jsonb),
              'author', jsonb_build_object('id', s.author_id, 'username', s.username, 'avatar_url', s.avatar_url,
                                           'role', s.role, 'tier', s.tier, 'is_founding', s.is_founding))
              FROM the_stack s),
    'filings', coalesce((SELECT jsonb_agg(jsonb_build_object(
              'id', f.id, 'kind', f.kind, 'title', f.title, 'text', f.text, 'words', f.words,
              'author', jsonb_build_object('id', f.author_id, 'username', f.username, 'avatar_url', f.avatar_url,
                                           'role', f.role, 'tier', f.tier, 'is_founding', f.is_founding))
              ORDER BY f.nth > 1, f.place) FROM the_filings f), '[]'::jsonb)
  );
$$;

COMMENT ON FUNCTION public.get_lobby() IS
  'The Lobby wall for the member asking: today''s edition, read under their own rules and blocks, one member one bill. No counts.';

REVOKE ALL ON FUNCTION public.get_lobby() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_lobby() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_lobby() TO authenticated;

-- ── TODAY, CHOSEN AGAIN UNDER THIS ORDER ────────────────────────────────────
-- The notices today's first choosing sent for pieces honoured on an earlier day
-- are taken back (each piece is told once); then today is chosen again.
DELETE FROM public.notifications n
 WHERE n.type = 'featured'
   AND n.created_at >= ((now() AT TIME ZONE 'UTC')::date)::timestamp AT TIME ZONE 'UTC'
   AND n.group_key IN (
     SELECT 'lobby:' || e.slot || ':' || e.target_id
       FROM public.lobby_editions e
      WHERE e.edition < (now() AT TIME ZONE 'UTC')::date
        AND e.place <= CASE e.slot WHEN 'post' THEN 3 ELSE 1 END);
DELETE FROM public.lobby_editions WHERE edition = (now() AT TIME ZONE 'UTC')::date;
SELECT public.lobby_choose_edition();
