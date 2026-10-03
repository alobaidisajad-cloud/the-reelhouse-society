-- ════════════════════════════════════════════════════════════════════════════
-- 20261003_03 — the house reads fast at any size
-- ════════════════════════════════════════════════════════════════════════════
-- Measured first on the CI load world (100,000 members) as e2e/load/proposed.sql:
-- every busy read under its 100 ms budget (Load run of 6c16031f). Rehearsed on
-- production, rolled back: mobile/supabase/diagnostics/the_house_reads_fast_rehearsal.sql.
--
-- THE HOUSE READS FAST AT ANY SIZE. Measured (Load run of a6e74c73), budget
-- 100 ms of database time per read:
--   following feed 31,000 · salon unread 2,874 · notices 501 / 497 ·
--   followers 401 · the paper 366 · stacks 229 · a hot post's critiques 177.
-- Every one of them did work per row that did not depend on the row.
-- ════════════════════════════════════════════════════════════════════════════

-- No certification or critique may land between the count below and the
-- triggers that keep it: writes to the two tables wait for this transaction.
LOCK TABLE public.interactions, public.log_comments IN SHARE ROW EXCLUSIVE MODE;

-- ── 1 · The hidden set, once per statement ────────────────────────────────
-- is_hidden_by(viewer, author) ran once per ROW: 50,000 notices, 50,000 calls.
-- The set it tests is the viewer's, not the row's: who I blocked or muted, and
-- who blocked me (a mute is one-way). Asked once as `(SELECT hidden_authors())`
-- it is an InitPlan, and each row costs an array test.
CREATE FUNCTION public.hidden_authors() RETURNS uuid[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT COALESCE(array_agg(DISTINCT h.author), '{}'::uuid[]) FROM (
    SELECT b.blocked_id AS author FROM public.user_blocks b WHERE b.blocker_id = auth.uid()
    UNION ALL
    SELECT b.blocker_id FROM public.user_blocks b WHERE b.blocked_id = auth.uid() AND b.type = 'block'
  ) h;
$$;
COMMENT ON FUNCTION public.hidden_authors() IS 'The members whose words are hidden from the caller: those they blocked or muted, and those who blocked them. The same rule as is_hidden_by, asked once per statement. It names no one is_hidden_by does not already answer for.';
REVOKE ALL ON FUNCTION public.hidden_authors() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hidden_authors() TO anon, authenticated, service_role;

-- NOT COALESCE(x = ANY(...), false): a row with no author (NULL) is not hidden,
-- exactly as is_hidden_by(uid, NULL) answered.
ALTER POLICY certs_block ON public.dispatch_certifications
  USING (NOT COALESCE(user_id = ANY ((SELECT public.hidden_authors())::uuid[]), false));
ALTER POLICY critiques_block ON public.dispatch_comments
  USING (NOT COALESCE(user_id = ANY ((SELECT public.hidden_authors())::uuid[]), false));
ALTER POLICY dossier_comments_hide_blocked ON public.dossier_comments_legacy
  USING (NOT COALESCE(user_id = ANY ((SELECT public.hidden_authors())::uuid[]), false));
ALTER POLICY list_comments_hide_blocked ON public.list_comments
  USING (NOT COALESCE(user_id = ANY ((SELECT public.hidden_authors())::uuid[]), false));
ALTER POLICY log_comments_hide_blocked ON public.log_comments
  USING (NOT COALESCE(user_id = ANY ((SELECT public.hidden_authors())::uuid[]), false));
ALTER POLICY notifications_hide_blocked ON public.notifications
  USING (NOT COALESCE(from_user_id = ANY ((SELECT public.hidden_authors())::uuid[]), false));
ALTER POLICY posts_block ON public.dispatch_posts
  USING (NOT COALESCE(user_id = ANY ((SELECT public.hidden_authors())::uuid[]), false));

-- ── 2 · A log's counts are kept, not counted ──────────────────────────────
-- Counted under the reader's own row security, a log with 5,000 certifications
-- ran 5,000 privacy checks for every reader, and the total DEPENDED on the
-- reader: a sealed member's certification was invisible to everyone they had
-- not admitted. The same defect was fixed for stacks (list_certify_count) and
-- never had to be for the Dispatch, which keeps its counts. A log now does too.
CREATE TABLE public.log_counts (
    log_id uuid PRIMARY KEY REFERENCES public.logs(id) ON DELETE CASCADE,
    certify_count integer NOT NULL DEFAULT 0 CHECK (certify_count >= 0),
    critique_count integer NOT NULL DEFAULT 0 CHECK (critique_count >= 0)
);
COMMENT ON TABLE public.log_counts IS 'Every certification and critique of a log, kept by triggers on interactions and log_comments. A log with no row has none. Read-only to clients; the same for every reader.';
ALTER TABLE public.log_counts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.log_counts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.log_counts TO anon, authenticated;
GRANT ALL ON public.log_counts TO service_role;
-- A count is readable where its log is: the EXISTS runs under logs' own rules.
CREATE POLICY log_counts_read ON public.log_counts FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.logs l WHERE l.id = log_counts.log_id));

CREATE FUNCTION public.log_counts_keep_certify() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'UPDATE') AND OLD.type = 'endorse_log' AND OLD.target_log_id IS NOT NULL THEN
    UPDATE public.log_counts SET certify_count = GREATEST(0, certify_count - 1) WHERE log_id = OLD.target_log_id;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.type = 'endorse_log' AND NEW.target_log_id IS NOT NULL THEN
    INSERT INTO public.log_counts AS c (log_id, certify_count) VALUES (NEW.target_log_id, 1)
      ON CONFLICT (log_id) DO UPDATE SET certify_count = c.certify_count + 1;
  END IF;
  RETURN NULL;
END $$;

CREATE FUNCTION public.log_counts_keep_critique() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    UPDATE public.log_counts SET critique_count = GREATEST(0, critique_count - 1) WHERE log_id = OLD.log_id;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    INSERT INTO public.log_counts AS c (log_id, critique_count) VALUES (NEW.log_id, 1)
      ON CONFLICT (log_id) DO UPDATE SET critique_count = c.critique_count + 1;
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.log_counts_keep_certify() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_counts_keep_critique() FROM PUBLIC, anon, authenticated;

-- Only the marks that are certifications pay for this; a follow does not.
CREATE TRIGGER log_counts_certify_insert AFTER INSERT ON public.interactions
  FOR EACH ROW WHEN (NEW.type = 'endorse_log') EXECUTE FUNCTION public.log_counts_keep_certify();
CREATE TRIGGER log_counts_certify_delete AFTER DELETE ON public.interactions
  FOR EACH ROW WHEN (OLD.type = 'endorse_log') EXECUTE FUNCTION public.log_counts_keep_certify();
CREATE TRIGGER log_counts_certify_update AFTER UPDATE OF type, target_log_id ON public.interactions
  FOR EACH ROW WHEN ((OLD.type = 'endorse_log' OR NEW.type = 'endorse_log')
                     AND (OLD.type IS DISTINCT FROM NEW.type OR OLD.target_log_id IS DISTINCT FROM NEW.target_log_id))
  EXECUTE FUNCTION public.log_counts_keep_certify();
CREATE TRIGGER log_counts_critique_insert AFTER INSERT ON public.log_comments
  FOR EACH ROW EXECUTE FUNCTION public.log_counts_keep_critique();
CREATE TRIGGER log_counts_critique_delete AFTER DELETE ON public.log_comments
  FOR EACH ROW EXECUTE FUNCTION public.log_counts_keep_critique();
CREATE TRIGGER log_counts_critique_update AFTER UPDATE OF log_id ON public.log_comments
  FOR EACH ROW WHEN (OLD.log_id IS DISTINCT FROM NEW.log_id) EXECUTE FUNCTION public.log_counts_keep_critique();

-- Every mark that already exists, counted once; a log with none gets no row.
INSERT INTO public.log_counts (log_id, certify_count, critique_count)
SELECT x.log_id, sum(x.certify)::integer, sum(x.critique)::integer FROM (
  SELECT i.target_log_id AS log_id, 1 AS certify, 0 AS critique
    FROM public.interactions i WHERE i.type = 'endorse_log' AND i.target_log_id IS NOT NULL
  UNION ALL
  SELECT c.log_id, 0, 1 FROM public.log_comments c
) x
GROUP BY x.log_id;

-- ── 3 · The feeds walk an index and stop ──────────────────────────────────
-- A member's newest reviewed logs, and the house's: the two walks the feeds make.
CREATE INDEX logs_reviewed_by_author ON public.logs (user_id, created_at DESC, id DESC)
  WHERE review IS NOT NULL AND review <> '';
CREATE INDEX logs_reviewed_newest ON public.logs (created_at DESC, id DESC)
  WHERE review IS NOT NULL AND review <> '';

-- The house feed: unchanged in what it returns and to whom (it runs under the
-- reader's row security, as before); its counts are read, not counted.
CREATE OR REPLACE FUNCTION public.get_community_feed_auth_cursor(p_limit integer DEFAULT 40, p_cursor_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid) RETURNS TABLE(id uuid, film_id integer, film_title text, poster_path text, rating numeric, review text, drop_cap boolean, status text, abandoned_reason text, created_at timestamp with time zone, year text, user_id uuid, username text, avatar_url text, role text, editorial_header text, pull_quote text, watched_with text, is_autopsied boolean, autopsy jsonb, is_spoiler boolean, certify_count integer, critique_count integer, certified boolean)
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT
    l.id, l.film_id, l.film_title, l.poster_path, l.rating, l.review,
    l.drop_cap, l.status, l.abandoned_reason, l.created_at, l.year,
    l.user_id,
    p.username, p.avatar_url, p.role,
    l.editorial_header, l.pull_quote, l.watched_with,
    l.is_autopsied, l.autopsy, l.is_spoiler,
    COALESCE(c.certify_count, 0) AS certify_count,
    COALESCE(c.critique_count, 0) AS critique_count,
    (auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM interactions im
       WHERE im.target_log_id = l.id AND im.user_id = auth.uid() AND im.type = 'endorse_log'
    )) AS certified
  FROM logs l
  JOIN profiles p ON p.id = l.user_id
  LEFT JOIN log_counts c ON c.log_id = l.id
  WHERE l.review IS NOT NULL
    AND l.review <> ''
    AND NOT COALESCE(l.user_id = ANY ((SELECT hidden_authors())::uuid[]), false)
    AND (
      p_cursor_created_at IS NULL
      OR (l.created_at, l.id) < (p_cursor_created_at, p_cursor_id)
    )
  ORDER BY l.created_at DESC, l.id DESC
  LIMIT p_limit;
$$;

-- The following feed: it took every followee's every log, under the reader's
-- row security row by row, and sorted them all. It now asks each followee
-- once — may I read them (can_view_user_data, the very rule logs_select_
-- authorized applies to each of their logs), are they hidden from me — and
-- takes their newest p_limit from the index; the newest p_limit of those is
-- the page. DEFINER, because the per-row policy is what it replaces; the rule
-- is applied per followee instead, and nothing else of logs is read.
CREATE OR REPLACE FUNCTION public.get_following_feed_auth_cursor(p_limit integer DEFAULT 40, p_cursor_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid) RETURNS TABLE(id uuid, film_id integer, film_title text, poster_path text, rating numeric, review text, drop_cap boolean, status text, abandoned_reason text, created_at timestamp with time zone, year text, user_id uuid, username text, avatar_url text, role text, editorial_header text, pull_quote text, watched_with text, is_autopsied boolean, autopsy jsonb, is_spoiler boolean, certify_count integer, critique_count integer, certified boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  WITH followed AS (
    SELECT i.target_user_id AS author
      FROM public.interactions i
     WHERE i.user_id = auth.uid()
       AND i.type = 'follow'
       AND NOT COALESCE(i.target_user_id = ANY ((SELECT public.hidden_authors())::uuid[]), false)
       AND public.can_view_user_data(i.target_user_id)
  ),
  page AS (
    SELECT r.id, r.created_at
      FROM followed f
      CROSS JOIN LATERAL (
        SELECT l.id, l.created_at
          FROM public.logs l
         WHERE l.user_id = f.author
           AND l.review IS NOT NULL
           AND l.review <> ''
           AND (p_cursor_created_at IS NULL OR (l.created_at, l.id) < (p_cursor_created_at, p_cursor_id))
         ORDER BY l.created_at DESC, l.id DESC
         LIMIT p_limit
      ) r
     ORDER BY r.created_at DESC, r.id DESC
     LIMIT p_limit
  )
  SELECT
    l.id, l.film_id, l.film_title, l.poster_path, l.rating, l.review,
    l.drop_cap, l.status, l.abandoned_reason, l.created_at, l.year,
    l.user_id,
    p.username, p.avatar_url, p.role,
    l.editorial_header, l.pull_quote, l.watched_with,
    l.is_autopsied, l.autopsy, l.is_spoiler,
    COALESCE(c.certify_count, 0) AS certify_count,
    COALESCE(c.critique_count, 0) AS critique_count,
    EXISTS (
      SELECT 1 FROM public.interactions im
       WHERE im.target_log_id = l.id AND im.user_id = auth.uid() AND im.type = 'endorse_log'
    ) AS certified
  FROM page pg
  JOIN public.logs l ON l.id = pg.id
  JOIN public.profiles p ON p.id = l.user_id
  LEFT JOIN public.log_counts c ON c.log_id = l.id
  ORDER BY pg.created_at DESC, pg.id DESC;
$$;

-- Stacks: the page is chosen from lists alone, walking their newest-first
-- index, and only its rows are dressed; before, every public stack was joined
-- to its author and tested for hiding before the sort could start.
--
-- A SEARCH walked thousands of stacks to find sixty, and each paid the row
-- policy (can_view_user_data, a function call) before the cheap test of its
-- title could turn it away. DEFINER, so the title and the handle are asked
-- first and the reader's right to see the author only of what matched — the
-- very rule lists_select_authorized applies to a public stack. The handles
-- that match are found once (an indexed set), not per stack; and trigram
-- indexes find a rare title or handle without walking the shelf at all.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE INDEX lists_title_trigram ON public.lists USING gin (title extensions.gin_trgm_ops) WHERE is_private = false;
CREATE INDEX profiles_username_trigram ON public.profiles USING gin (username extensions.gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.get_filtered_stacks_auth_cursor_v2(p_search text DEFAULT ''::text, p_filter_following boolean DEFAULT false, p_limit integer DEFAULT 60, p_cursor_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid, p_poster_count integer DEFAULT 4) RETURNS TABLE(id uuid, title text, description text, username text, user_id uuid, created_at timestamp with time zone, films jsonb, film_count bigint, certify_count bigint, is_ranked boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  WITH page AS (
    SELECT l.id
      FROM lists l
     WHERE l.is_private = false
       AND NOT COALESCE(l.user_id = ANY ((SELECT hidden_authors())::uuid[]), false)
       AND (
         COALESCE(p_search, '') = ''
         OR l.title ILIKE '%' || like_escape(p_search) || '%' ESCAPE '\'
         OR l.user_id IN (
           SELECT pu.id FROM profiles pu
            WHERE pu.username ILIKE '%' || like_escape(p_search) || '%' ESCAPE '\'
         )
       )
       AND public.can_view_user_data(l.user_id)
       AND (
         p_filter_following = false
         OR EXISTS (
           SELECT 1 FROM interactions i
           WHERE i.target_user_id = l.user_id
             AND i.user_id = auth.uid()
             AND i.type = 'follow'
         )
       )
       AND (
         p_cursor_created_at IS NULL
         OR (l.created_at, l.id) < (p_cursor_created_at, p_cursor_id)
       )
     ORDER BY l.created_at DESC, l.id DESC
     LIMIT p_limit
  )
  SELECT
    l.id, l.title, l.description,
    p.username, l.user_id, l.created_at,
    COALESCE(
      (SELECT jsonb_agg(f ORDER BY f_created_at ASC)
       FROM (
         SELECT jsonb_build_object('id', li.film_id, 'title', li.film_title,
                                   'poster_path', li.poster_path) AS f,
                li.created_at AS f_created_at
         FROM list_items li
         WHERE li.list_id = l.id AND li.poster_path IS NOT NULL
         ORDER BY li.created_at ASC
         LIMIT LEAST(GREATEST(p_poster_count, 0), 10)
       ) top_films),
      '[]'::jsonb
    ) AS films,
    (SELECT COUNT(*) FROM list_items li WHERE li.list_id = l.id) AS film_count,
    public.list_certify_count(l.id) AS certify_count,
    l.is_ranked
  FROM page pg
  JOIN lists l ON l.id = pg.id
  JOIN profiles p ON p.id = l.user_id
  ORDER BY l.created_at DESC, l.id DESC;
$$;

-- ── 4 · Salon unread counts, read only as far as they are shown ───────────
-- It ran under row security over every message of every room the member is in
-- and counted them whole — 200,000 for a hot room — for a seal that reads
-- "9+ NEW" past nine. A room is readable exactly as "Lounge messages readable"
-- says (public, or the member admitted); the count stops at 100, and skips the
-- authors hidden from the member, as the room itself does (purgeHiddenMessages):
-- the seal promised more than the room would show.
CREATE OR REPLACE FUNCTION public.get_lounge_unread_counts() RETURNS TABLE(lounge_id uuid, unread_count bigint, last_message_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  WITH me AS (SELECT auth.uid() AS id, public.hidden_authors() AS hidden),
  rooms AS (
    SELECT lm.lounge_id, lm.last_read_at, (NOT l.is_private OR lm.status = 'approved') AS readable
      FROM me
      JOIN public.lounge_members lm ON lm.user_id = me.id
      JOIN public.lounges l ON l.id = lm.lounge_id
  )
  SELECT
    r.lounge_id,
    CASE WHEN r.readable THEN (
      SELECT count(*) FROM (
        SELECT 1 FROM public.lounge_messages m
         WHERE m.lounge_id = r.lounge_id
           AND m.user_id <> me.id
           AND (r.last_read_at IS NULL OR m.created_at > r.last_read_at)
           AND NOT COALESCE(m.user_id = ANY (me.hidden), false)
         LIMIT 100
      ) unread
    ) ELSE 0 END AS unread_count,
    CASE WHEN r.readable THEN (
      SELECT max(m.created_at) FROM public.lounge_messages m WHERE m.lounge_id = r.lounge_id
    ) END AS last_message_at
  FROM rooms r CROSS JOIN me;
$$;
REVOKE ALL ON FUNCTION public.get_lounge_unread_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_lounge_unread_counts() TO authenticated, service_role;

-- The room's newest-first index carries each message's author, so a count of
-- up to 100 per room, for a member in hundreds of rooms, reads the index and
-- never the table (the room's own pages read it in the same order).
CREATE INDEX lounge_messages_room_newest ON public.lounge_messages (lounge_id, created_at DESC, id DESC) INCLUDE (user_id);
DROP INDEX public.lounge_messages_lounge_created_id_idx;

-- ── 5 · Every ordered page has the index it is read in ────────────────────
-- A member's notices, newest first; and the unread ones, counted from the
-- index alone (the hidden test reads from_user_id, which rides along).
CREATE INDEX notifications_member_newest ON public.notifications (user_id, created_at DESC, id DESC);
CREATE INDEX notifications_member_unread ON public.notifications (user_id) INCLUDE (from_user_id) WHERE (is_read = false);
DROP INDEX public.idx_notifications_is_read;
DROP INDEX public.idx_notifications_user_id_read;

-- The paper, in each of its orders, for the whole paper and each section. It
-- asks for published, not withheld; an ended ballot stays in it. The archive
-- (ended_at IS NULL as well) reads the first of these and filters the few.
CREATE INDEX dispatch_posts_paper_latest ON public.dispatch_posts (created_at DESC, id DESC)
  WHERE is_published AND withheld_at IS NULL;
CREATE INDEX dispatch_posts_paper_certified ON public.dispatch_posts (certify_count DESC, id DESC)
  WHERE is_published AND withheld_at IS NULL;
CREATE INDEX dispatch_posts_section_latest ON public.dispatch_posts (kind, created_at DESC, id DESC)
  WHERE is_published AND withheld_at IS NULL;
CREATE INDEX dispatch_posts_section_certified ON public.dispatch_posts (kind, certify_count DESC, id DESC)
  WHERE is_published AND withheld_at IS NULL;
DROP INDEX public.dispatch_posts_feed;

-- A filing's critiques, most certified first.
CREATE INDEX dispatch_comments_post_certified ON public.dispatch_comments (post_id, certify_count DESC, created_at DESC);

-- A member's followers, newest first.
CREATE INDEX interactions_followers_newest ON public.interactions (target_user_id, created_at DESC, user_id DESC)
  WHERE type = 'follow';

-- ── 6 · What nothing calls ────────────────────────────────────────────────
-- No app, website, edge function or database body calls these (searched
-- 2026-10-03); three of them answered anyone, signed in or not.
DROP FUNCTION public.get_dispatch_feed(integer, timestamp with time zone);
DROP FUNCTION public.get_featured_critique();
DROP FUNCTION public.get_filtered_stacks_auth_cursor(text, boolean, integer, timestamp with time zone, uuid);
DROP FUNCTION public.get_following_feed_cursor(text[], integer, timestamp with time zone, uuid);
