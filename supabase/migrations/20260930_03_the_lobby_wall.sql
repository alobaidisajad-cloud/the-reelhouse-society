-- ════════════════════════════════════════════════════════════════════════════
-- 20260930_03 — the Lobby wall: one edition a day, chosen by the house,
--               honoured on the piece and told to its author
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── WHAT WAS THERE ────────────────────────────────────────────────────────
-- The Lobby's one honour was get_featured_critique, which the app described as
-- "the most engaged". It was not: it picked the NEWEST review longer than 100
-- characters rated four or more. Nothing measured what members thought of
-- anything, nothing was held for a day, and nothing told the member honoured.
-- (get_featured_critique stays: the website still calls it.)
--
-- And a member may certify their own work (the live house held 11 logs, 2
-- stacks and 1 filing certified by their own authors), so a count of
-- certifications is not a count of anyone else's regard.
--
-- ── WHAT REPLACES IT ──────────────────────────────────────────────────────
-- ONE EDITION A DAY. At the first run after 00:00 UTC the house chooses, for
-- each of three slots — a log, a stack, the Dispatch's filings — up to twelve
-- pieces in order of honour, and holds them for that whole day. The wall shows
-- the first that the viewer may see (the viewer's own rules, as they read
-- them), so a piece that is deleted, made private or blocked gives its place to
-- the next, and the wall is never a hole.
--
-- THE ORDER OF HONOUR, for every slot alike:
--   the members, OTHER than its author, who certified it or critiqued it —
--   each member counted once for certifying and once for critiquing, a banned
--   member not at all — in the 24 hours before the edition; ties by the same
--   count over 7 days, then 30, then ever; then the newest piece; then its id,
--   so the choice is the same however often it is asked.
-- A piece never marked by anyone else still hangs if the house has nothing
-- better: "if tied, the most recent".
--
-- WHAT MAY HANG:
--   a log     with written words, not marked as a spoiler;
--   a stack   public, of four films or more;
--   a filing  published, open, not withheld, not behind a spoiler label;
-- each by an author who is neither banned nor private, and not kept off the
-- Lobby by the house (lobby_withheld).
--
-- WHO IS TOLD: the author of the first log, the first stack and the first
-- three filings, with a notice that never buzzes — the edition turns while much
-- of the house is asleep, so it waits under the bell (tg_notify_push returns
-- before any push for this type, and for nothing else).
--
-- THE HONOUR STAYS: lobby_editions is the record; a piece's own page reads its
-- dates from it ("Featured in the Lobby · 30 September").
--
-- KEPT OFF THE LOBBY: set_lobby_withheld, for an admin only, removes a piece
-- from every edition (today's wall moves to the next piece at once), deletes
-- the notice it sent, and keeps it from being chosen again.
--
-- No transaction control here: the rehearsal
-- (mobile/supabase/diagnostics/the_lobby_wall_rehearsal.sql) includes this file
-- inside its own transaction.
-- ════════════════════════════════════════════════════════════════════════════

-- ── THE RECORD ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lobby_editions (
  edition    date        NOT NULL,
  slot       text        NOT NULL CHECK (slot IN ('log', 'list', 'post')),
  place      smallint    NOT NULL CHECK (place BETWEEN 1 AND 12),
  target_id  uuid        NOT NULL,
  author_id  uuid        NOT NULL,
  -- the regard counted in the 24 hours before the edition, kept for the house;
  -- never granted to a member (the Lobby shows no counts)
  score      integer     NOT NULL,
  chosen_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (edition, slot, place),
  UNIQUE (edition, slot, target_id)
);

COMMENT ON TABLE public.lobby_editions IS
  'The Lobby''s daily editions: up to twelve pieces a slot, in order of honour. Written only by lobby_choose_edition; members read the ids, never the score.';

CREATE INDEX IF NOT EXISTS lobby_editions_target ON public.lobby_editions (target_id);

ALTER TABLE public.lobby_editions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lobby_editions_read ON public.lobby_editions;
CREATE POLICY lobby_editions_read ON public.lobby_editions FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.lobby_editions FROM PUBLIC, anon, authenticated;
GRANT SELECT (edition, slot, place, target_id) ON public.lobby_editions TO authenticated;

-- ── KEPT OFF THE LOBBY ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lobby_withheld (
  kind        text        NOT NULL CHECK (kind IN ('log', 'list', 'post')),
  target_id   uuid        NOT NULL,
  withheld_by uuid,
  withheld_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, target_id)
);

COMMENT ON TABLE public.lobby_withheld IS
  'Pieces the house keeps off the Lobby. Written only by set_lobby_withheld (admins); no member reads it.';

ALTER TABLE public.lobby_withheld ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lobby_withheld FROM PUBLIC, anon, authenticated;

-- ── THE WINDOWS ARE READ BY TIME ────────────────────────────────────────────
-- The four kinds of regard, each found by when it was given.
CREATE INDEX IF NOT EXISTS interactions_regard_at ON public.interactions (created_at)
  WHERE type IN ('endorse_log', 'endorse_list');
CREATE INDEX IF NOT EXISTS dispatch_certifications_post_at ON public.dispatch_certifications (created_at)
  WHERE post_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS list_comments_created_at ON public.list_comments (created_at);
CREATE INDEX IF NOT EXISTS dispatch_comments_created_at ON public.dispatch_comments (created_at);

-- ── A NOTICE OF HONOUR ──────────────────────────────────────────────────────
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
  'follow', 'endorse', 'comment', 'annotate', 'retransmit', 'system', 'reaction',
  'follow_request', 'follow_accept', 'moderation', 'featured']));

-- The push: unchanged but for its first lines. A notice of honour never buzzes.
CREATE OR REPLACE FUNCTION public.tg_notify_push() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $function$
DECLARE
  v_secret   text;
  v_pref_key text;
BEGIN
  -- The Lobby's edition turns at 00:00 UTC, while much of the house sleeps:
  -- its notice waits under the bell and is never pushed.
  IF NEW.type = 'featured' THEN
    RETURN NEW;
  END IF;

  IF NEW.from_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE (blocker_id = NEW.user_id      AND blocked_id = NEW.from_user_id)
       OR (blocker_id = NEW.from_user_id AND blocked_id = NEW.user_id AND type = 'block')
  ) THEN
    RETURN NEW;
  END IF;

  v_pref_key := CASE NEW.type
                  WHEN 'follow'         THEN 'notif_follows'
                  WHEN 'follow_request' THEN 'notif_follows'
                  WHEN 'follow_accept'  THEN 'notif_follows'
                  WHEN 'endorse'        THEN 'notif_endorsements'
                  WHEN 'endorse_log'    THEN 'notif_endorsements'
                  WHEN 'comment'        THEN 'notif_comments'
                  WHEN 'annotate'       THEN 'notif_comments'
                  WHEN 'system'         THEN 'notif_system'
                  ELSE NULL
                END;

  IF v_pref_key IS NOT NULL THEN
    IF (SELECT preferences ->> v_pref_key
          FROM public.profiles
         WHERE id = NEW.user_id) = 'false'
    THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'notify_push_secret' LIMIT 1;

  PERFORM net.http_post(
    url     := 'https://wihyqkpoymwcvbprslyz.supabase.co/functions/v1/notify-push',
    headers := jsonb_build_object('Content-Type','application/json','x-function-secret', v_secret),
    body    := jsonb_build_object('type','INSERT','table','notifications','record', to_jsonb(NEW))
  );
  RETURN NEW;
END;
$function$;

-- ── CHOOSING AN EDITION ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.lobby_choose_edition(p_edition date DEFAULT ((now() AT TIME ZONE 'UTC')::date))
    RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  -- the edition's moment: 00:00 UTC of its day; nothing given after it counts
  v_end timestamptz := p_edition::timestamp AT TIME ZONE 'UTC';
  v_chosen integer;
BEGIN
  -- One chooser at a time; and an edition, once chosen, is never chosen again.
  PERFORM pg_advisory_xact_lock(hashtext('public.lobby_choose_edition'));
  IF EXISTS (SELECT 1 FROM public.lobby_editions WHERE edition = p_edition) THEN
    RETURN 0;
  END IF;

  WITH regard AS (
    -- who marked what, and how: 'c' certified, 'q' critiqued; never its author
    SELECT 'log'::text AS slot, x.target_log_id AS target, x.user_id AS member, 'c' AS how, x.created_at AS at
      FROM public.interactions x JOIN public.logs l ON l.id = x.target_log_id
     WHERE x.type = 'endorse_log' AND x.user_id <> l.user_id AND x.created_at < v_end
    UNION ALL
    SELECT 'log', c.log_id, c.user_id, 'q', c.created_at
      FROM public.log_comments c JOIN public.logs l ON l.id = c.log_id
     WHERE c.user_id IS NOT NULL AND c.user_id <> l.user_id AND c.created_at < v_end
    UNION ALL
    SELECT 'list', x.target_list_id, x.user_id, 'c', x.created_at
      FROM public.interactions x JOIN public.lists s ON s.id = x.target_list_id
     WHERE x.type = 'endorse_list' AND x.user_id <> s.user_id AND x.created_at < v_end
    UNION ALL
    SELECT 'list', c.list_id, c.user_id, 'q', c.created_at
      FROM public.list_comments c JOIN public.lists s ON s.id = c.list_id
     WHERE c.user_id IS NOT NULL AND c.user_id <> s.user_id AND c.created_at < v_end
    UNION ALL
    SELECT 'post', c.post_id, c.user_id, 'c', c.created_at
      FROM public.dispatch_certifications c JOIN public.dispatch_posts d ON d.id = c.post_id
     WHERE c.post_id IS NOT NULL AND c.user_id <> d.user_id AND c.created_at < v_end
    UNION ALL
    SELECT 'post', c.post_id, c.user_id, 'q', c.created_at
      FROM public.dispatch_comments c JOIN public.dispatch_posts d ON d.id = c.post_id
     WHERE c.user_id IS NOT NULL AND c.user_id <> d.user_id AND c.created_at < v_end
  ),
  counted AS (
    -- a banned member's regard counts for nothing
    SELECT r.slot, r.target,
           count(DISTINCT r.how || r.member::text) FILTER (WHERE r.at >= v_end - interval '1 day')   AS day,
           count(DISTINCT r.how || r.member::text) FILTER (WHERE r.at >= v_end - interval '7 days')  AS week,
           count(DISTINCT r.how || r.member::text) FILTER (WHERE r.at >= v_end - interval '30 days') AS month,
           count(DISTINCT r.how || r.member::text)                                                    AS ever
      FROM regard r
      JOIN public.profiles m ON m.id = r.member
     WHERE NOT coalesce(m.is_banned, false)
     GROUP BY r.slot, r.target
  ),
  -- the pieces that may hang (the counted ones, and the newest, which the tie rule reaches)
  able AS (
    SELECT 'log'::text AS slot, l.id, l.user_id AS author, l.created_at
      FROM public.logs l JOIN public.profiles p ON p.id = l.user_id
     WHERE btrim(coalesce(l.review, '')) <> '' AND NOT coalesce(l.is_spoiler, false)
       AND l.created_at < v_end
       AND NOT coalesce(p.is_banned, false) AND NOT coalesce(p.is_social_private, false)
       AND NOT EXISTS (SELECT 1 FROM public.lobby_withheld w WHERE w.kind = 'log' AND w.target_id = l.id)
       AND (l.id IN (SELECT target FROM counted WHERE slot = 'log')
            OR l.id IN (SELECT n.id FROM public.logs n
                          JOIN public.profiles np ON np.id = n.user_id
                         WHERE btrim(coalesce(n.review, '')) <> '' AND NOT coalesce(n.is_spoiler, false)
                           AND n.created_at < v_end
                           AND NOT coalesce(np.is_banned, false) AND NOT coalesce(np.is_social_private, false)
                         ORDER BY n.created_at DESC LIMIT 24))
    UNION ALL
    SELECT 'list', s.id, s.user_id, s.created_at
      FROM public.lists s JOIN public.profiles p ON p.id = s.user_id
     WHERE NOT coalesce(s.is_private, false)
       AND (SELECT count(*) FROM public.list_items i WHERE i.list_id = s.id) >= 4
       AND s.created_at < v_end
       AND NOT coalesce(p.is_banned, false) AND NOT coalesce(p.is_social_private, false)
       AND NOT EXISTS (SELECT 1 FROM public.lobby_withheld w WHERE w.kind = 'list' AND w.target_id = s.id)
       AND (s.id IN (SELECT target FROM counted WHERE slot = 'list')
            OR s.id IN (SELECT n.id FROM public.lists n
                          JOIN public.profiles np ON np.id = n.user_id
                         WHERE NOT coalesce(n.is_private, false) AND n.created_at < v_end
                           AND (SELECT count(*) FROM public.list_items i WHERE i.list_id = n.id) >= 4
                           AND NOT coalesce(np.is_banned, false) AND NOT coalesce(np.is_social_private, false)
                         ORDER BY n.created_at DESC LIMIT 24))
    UNION ALL
    SELECT 'post', d.id, d.user_id, d.created_at
      FROM public.dispatch_posts d JOIN public.profiles p ON p.id = d.user_id
     WHERE coalesce(d.is_published, false) AND d.withheld_at IS NULL AND d.ended_at IS NULL
       AND d.spoiler_label IS NULL AND d.created_at < v_end
       AND NOT coalesce(p.is_banned, false) AND NOT coalesce(p.is_social_private, false)
       AND NOT EXISTS (SELECT 1 FROM public.lobby_withheld w WHERE w.kind = 'post' AND w.target_id = d.id)
       AND (d.id IN (SELECT target FROM counted WHERE slot = 'post')
            OR d.id IN (SELECT n.id FROM public.dispatch_posts n
                          JOIN public.profiles np ON np.id = n.user_id
                         WHERE coalesce(n.is_published, false) AND n.withheld_at IS NULL AND n.ended_at IS NULL
                           AND n.spoiler_label IS NULL AND n.created_at < v_end
                           AND NOT coalesce(np.is_banned, false) AND NOT coalesce(np.is_social_private, false)
                         ORDER BY n.created_at DESC LIMIT 24))
  ),
  ranked AS (
    SELECT a.slot, a.id, a.author, coalesce(c.day, 0) AS day,
           row_number() OVER (PARTITION BY a.slot
                              ORDER BY coalesce(c.day, 0) DESC, coalesce(c.week, 0) DESC,
                                       coalesce(c.month, 0) DESC, coalesce(c.ever, 0) DESC,
                                       a.created_at DESC, a.id) AS place
      FROM able a LEFT JOIN counted c ON c.slot = a.slot AND c.target = a.id
  )
  INSERT INTO public.lobby_editions (edition, slot, place, target_id, author_id, score)
  SELECT p_edition, slot, place, id, author, day FROM ranked WHERE place <= 12;

  GET DIAGNOSTICS v_chosen = ROW_COUNT;

  -- The authors of what hangs are told, once, without a push.
  INSERT INTO public.notifications (user_id, type, message, group_key)
  SELECT e.author_id, 'featured',
         CASE e.slot WHEN 'log'  THEN 'Your log hangs in the Lobby today.'
                     WHEN 'list' THEN 'Your stack hangs in the Lobby today.'
                     ELSE             'Your filing hangs in the Lobby today.' END,
         'lobby:' || e.slot || ':' || e.target_id
    FROM public.lobby_editions e
   WHERE e.edition = p_edition
     AND e.place <= CASE e.slot WHEN 'post' THEN 3 ELSE 1 END;

  RETURN v_chosen;
END;
$$;

COMMENT ON FUNCTION public.lobby_choose_edition(date) IS
  'Chooses the Lobby''s edition for a day, once. Run by the lobby-edition job; no role may call it.';

REVOKE ALL ON FUNCTION public.lobby_choose_edition(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lobby_choose_edition(date) FROM anon, authenticated;

-- ── READING THE WALL ────────────────────────────────────────────────────────
-- As the member: logs, stacks and filings answer under their own rules (a
-- private author's piece reaches only their followers), the blocks the member
-- keeps are honoured, and what may no longer hang gives its place to the next
-- — asked here for every piece, since an author reads their own whatever its
-- state: words deleted, a spoiler marked, a stack cut below four films, a
-- filing withheld, drawn back or ended since the edition was chosen.
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
     ORDER BY e.place
     LIMIT 1
  ),
  the_filings AS (
    SELECT d.id, d.kind, d.title,
           left(coalesce(nullif(d.full_content, ''), d.body, ''), 1500) AS text,
           coalesce(array_length(regexp_split_to_array(btrim(coalesce(nullif(d.full_content, ''), d.body, '')), '\s+'), 1), 0) AS words,
           p.id AS author_id, p.username, p.avatar_url, p.role, p.tier, p.is_founding,
           e.place
      FROM ed
      JOIN public.lobby_editions e ON e.edition = ed.edition AND e.slot = 'post'
      JOIN public.dispatch_posts d ON d.id = e.target_id
      JOIN public.profiles p ON p.id = d.user_id
     -- asked here, not left to the rules: an author reads their own withheld or drawn-back filing
     WHERE coalesce(d.is_published, false) AND d.withheld_at IS NULL
       AND d.ended_at IS NULL AND d.spoiler_label IS NULL
       AND NOT coalesce(p.is_banned, false)
     ORDER BY e.place
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
              ORDER BY f.place) FROM the_filings f), '[]'::jsonb)
  );
$$;

COMMENT ON FUNCTION public.get_lobby() IS
  'The Lobby wall for the member asking: today''s edition, read under their own rules and blocks. No counts.';

REVOKE ALL ON FUNCTION public.get_lobby() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_lobby() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_lobby() TO authenticated;

-- ── KEEPING A PIECE OFF THE LOBBY ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_lobby_withheld(p_kind text, p_target uuid, p_keep_off boolean)
    RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin role required' USING ERRCODE = '42501';
  END IF;
  IF p_kind NOT IN ('log', 'list', 'post') OR p_target IS NULL THEN
    RAISE EXCEPTION 'Nothing to keep: a kind (log, list, post) and a piece' USING ERRCODE = '22023';
  END IF;

  IF p_keep_off THEN
    INSERT INTO public.lobby_withheld (kind, target_id, withheld_by)
    VALUES (p_kind, p_target, auth.uid())
    ON CONFLICT (kind, target_id) DO NOTHING;
    -- off every wall at once, the honour with it, and the notice that announced it
    DELETE FROM public.lobby_editions WHERE slot = p_kind AND target_id = p_target;
    DELETE FROM public.notifications WHERE type = 'featured' AND group_key = 'lobby:' || p_kind || ':' || p_target;
  ELSE
    -- it may be chosen again from the next edition; the days it lost are not restored
    DELETE FROM public.lobby_withheld WHERE kind = p_kind AND target_id = p_target;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.set_lobby_withheld(text, uuid, boolean) IS
  'An admin keeps a piece off the Lobby (true) or lets it be chosen again (false).';

REVOKE ALL ON FUNCTION public.set_lobby_withheld(text, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_lobby_withheld(text, uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_lobby_withheld(text, uuid, boolean) TO authenticated;

-- ── THE JOB ─────────────────────────────────────────────────────────────────
-- Every hour at five past: the first run after midnight UTC chooses the day's
-- edition; every later run finds it chosen and does nothing. A missed hour is
-- caught by the next, and until then the wall shows the last edition chosen.
-- `cron.schedule(job_name, ...)` replaces a job of the same name, which is what
-- makes re-running this file safe.
SELECT cron.schedule(
  'lobby-edition',
  '5 * * * *',
  $$SELECT public.lobby_choose_edition();$$
);

-- Today's edition, now.
SELECT public.lobby_choose_edition();
