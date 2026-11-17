-- ════════════════════════════════════════════════════════════════════════════
-- 20261116_01 — the door counts only who may come in, and a critique's certification is a critique's.
-- ════════════════════════════════════════════════════════════════════════════
--   1. The corridor (get_lounge_list) counted every request at a host's door, a member the host
--      has blocked or muted among them: the salon's card said "1 AT THE DOOR" for one the room
--      itself no longer offers (review round 6). The pending piece now leaves out whoever is
--      hidden from the host (is_hidden_by, as the salon's faces and unread counts already do),
--      and names each requester, so the phone leaves out one hidden since it was read.
--   2. A certification of a critique was written with its filing's group key (endorse:post:<id>),
--      the key of a certification of the filing itself: three certifications of a member's
--      critique were told as "3 members certified your filing", a filing they never wrote. It is
--      now endorse:critique:<the filing's id>: the phone says "your critique" and opens the filing;
--      a phone that does not know the word leaves those notices single, as it does any key it
--      does not know.
--   3. A salon's card in YOUR SALONS took its "LAST WORD" time, and its place in the rail, from the
--      newest message in the room, one from a member the reader has blocked or muted among them
--      (review round 8): "LAST WORD 1M AGO" over a room with nothing new to read. The time is now
--      the last word the reader can read, as the directory's rooms already are (get_salon_last_words).
--   4. A film's search in the Dispatch archive was counted on the phone from the newest 120 rows:
--      short of the film's plate, a hidden author's filings in it, a film past them not found
--      (review round 9). The house counts it now (dispatch_archive_films), the hidden left out.
--   5. A banned member's row was taken by the host's REMOVE, or by the member stepping out, while
--      the ban stood: the host had no UNBAN left, and the member was offered a seat the house
--      refused (review round 9). A banned row now stays; those taken are put back, banned.
--   6. A member's FOLLOWERS and FOLLOWING counted members the reader has hidden, whom the lists
--      leave out (review round 9): the counts leave them out too.
--   7. A muted member of a private salon was told they can read, and the house gave its words,
--      reactions, channel and roster to approved seats alone: they read an empty room (review round
--      10). A muted seat reads them now, and its unread count is counted.
--   8. A member an author has blocked still read that author's records and stacks wherever a log or a
--      stack is read directly (review round 10): logs and lists take the house's rule for the hidden.
--   The rehearsal holds each, the members acting as themselves.
-- Undo: mobile/supabase/migrations-down/20261116_01_each_is_told_as_what_it_is.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- add-only (3): it only fixes: the calls replayed as the members themselves, the corridor's every piece as before, and its door without a member the host has hidden (each_is_told_as_what_it_is_rehearsal.sql)
CREATE OR REPLACE FUNCTION public.get_lounge_list() RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  WITH me AS (SELECT auth.uid() AS id),
  memberships AS (
    SELECT lm.lounge_id, lm.last_read_at, lm.status
      FROM public.lounge_members lm, me WHERE lm.user_id = me.id LIMIT 100
  ),
  newest AS (
    SELECT l.id, l.name, l.description, l.is_private, l.creator_id, l.created_at, l.member_count, l.cover_image
      FROM public.lounges l ORDER BY l.created_at DESC LIMIT 50
  ),
  hosted AS (
    SELECT l.id, l.name, l.description, l.is_private, l.creator_id, l.created_at, l.member_count, l.cover_image
      FROM public.lounges l, me WHERE l.creator_id = me.id
  ),
  joined AS (
    SELECT l.id, l.name, l.description, l.is_private, l.creator_id, l.created_at, l.member_count, l.cover_image
      FROM public.lounges l WHERE l.id IN (SELECT lounge_id FROM memberships)
  ),
  -- The member's own: seated (a ban or a mute is no seat) or hosted.
  own AS (
    SELECT lounge_id AS id FROM memberships WHERE status IS NULL OR status NOT IN ('banned', 'muted')
    UNION SELECT id FROM hosted
  )
  SELECT jsonb_build_object(
    'memberships', coalesce((SELECT jsonb_agg(to_jsonb(m)) FROM memberships m), '[]'::jsonb),
    'newest', coalesce((SELECT jsonb_agg(to_jsonb(n) ORDER BY n.created_at DESC) FROM newest n), '[]'::jsonb),
    'hosted', coalesce((SELECT jsonb_agg(to_jsonb(h)) FROM hosted h), '[]'::jsonb),
    'joined', coalesce((SELECT jsonb_agg(to_jsonb(j)) FROM joined j), '[]'::jsonb),
    -- Asked only of a member who sits somewhere, as the client asks it; every piece a list.
    'unread', CASE WHEN EXISTS (SELECT 1 FROM memberships)
      THEN coalesce((SELECT jsonb_agg(to_jsonb(u)) FROM public.get_lounge_unread_counts() u), '[]'::jsonb)
      ELSE '[]'::jsonb END,
    -- Who waits at the doors the member hosts, each named: never one the host has blocked or
    -- muted (the room does not offer them to be admitted across it, nor counts them).
    'pending', coalesce((SELECT jsonb_agg(jsonb_build_object('lounge_id', p.lounge_id, 'user_id', p.user_id))
      FROM public.lounge_members p WHERE p.lounge_id IN (SELECT id FROM hosted) AND p.status = 'pending'
        AND NOT public.is_hidden_by((SELECT id FROM me), p.user_id)), '[]'::jsonb),
    'faces', coalesce((SELECT jsonb_agg(to_jsonb(f))
      FROM public.get_salon_member_faces(ARRAY(SELECT id FROM own)) f), '[]'::jsonb),
    'last_words', coalesce((SELECT jsonb_agg(to_jsonb(w))
      FROM public.get_salon_last_words(ARRAY(SELECT id FROM newest WHERE id NOT IN (SELECT id FROM own))) w), '[]'::jsonb)
  )
$$;

-- add-only (3): it only fixes: the calls replayed as the members themselves, a filing's certification told as before and a critique's under its own key (each_is_told_as_what_it_is_rehearsal.sql)
CREATE OR REPLACE FUNCTION public.dispatch_notify_certify() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE p record; c record;
BEGIN
  IF NEW.post_id IS NOT NULL THEN
    SELECT id, user_id, kind, title INTO p
      FROM public.dispatch_posts WHERE id = NEW.post_id;
    PERFORM public.dispatch_notify(
      p.user_id, NEW.user_id, 'endorse',
      'certified ' || public.dispatch_names(p.kind, p.title) || '.',
      jsonb_build_object('dispatch_post_id', p.id, 'kind', p.kind, 'title', p.title),
      'endorse:post:' || p.id);
  ELSE
    SELECT id, user_id, post_id INTO c
      FROM public.dispatch_comments WHERE id = NEW.comment_id;
    -- Its own key: under the filing's, a critique's certifications were told as the filing's.
    PERFORM public.dispatch_notify(
      c.user_id, NEW.user_id, 'endorse',
      'certified your critique.',
      jsonb_build_object('dispatch_post_id', c.post_id, 'comment_id', c.id),
      'endorse:critique:' || c.post_id);
  END IF;
  RETURN NEW;
END $$;

-- add-only (3): it only fixes: the calls replayed as the members themselves, a salon's unread count as before and its last word without a member the reader has hidden (each_is_told_as_what_it_is_rehearsal.sql)
CREATE OR REPLACE FUNCTION public.get_lounge_unread_counts() RETURNS TABLE(lounge_id uuid, unread_count bigint, last_message_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  WITH me AS (SELECT auth.uid() AS id, public.hidden_authors() AS hidden),
  rooms AS (
    SELECT lm.lounge_id, lm.last_read_at, (NOT l.is_private OR lm.status IN ('approved', 'muted')) AS readable
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
    -- The last word the member can read: one from a member they hid moved the card to the front
    -- and said "LAST WORD 1M AGO" over a room with nothing new in it (review round 8).
    CASE WHEN r.readable THEN (
      SELECT m.created_at FROM public.lounge_messages m
       WHERE m.lounge_id = r.lounge_id
         AND NOT COALESCE(m.user_id = ANY (me.hidden), false)
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT 1
    ) END AS last_message_at
  FROM rooms r CROSS JOIN me;
$$;

-- A film's search in the Dispatch archive, counted by the house: the phone counted the newest 120
-- matching rows itself, so a film's count fell short of its plate's and held the filings of authors
-- the reader has hidden, and a film past those rows was not found (review round 9). The pattern is
-- the phone's own, built as every search builds it (buildSearchPattern: LIKE's marks escaped).
-- As the caller (SECURITY INVOKER): the filings' own rules decide what is counted, and the hidden
-- are left out as everywhere else.
CREATE FUNCTION public.dispatch_archive_films(p_pattern text)
    RETURNS TABLE(subject_id integer, subject_title text, subject_sub text, subject_image text, filings bigint)
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  WITH me AS (SELECT public.hidden_authors() AS hidden),
  hits AS (
    SELECT p.subject_id, p.subject_title, p.subject_sub, p.subject_image, p.created_at, p.id
      FROM public.dispatch_posts p CROSS JOIN me
     WHERE p.subject_kind = 'film'
       AND p.subject_id IS NOT NULL
       AND p.subject_title IS NOT NULL
       AND p.is_published
       AND p.withheld_at IS NULL
       AND p.ended_at IS NULL
       AND p.subject_title ILIKE '%' || COALESCE(p_pattern, '') || '%'
       AND NOT COALESCE(p.user_id = ANY (me.hidden), false)
  ),
  -- Each film once, its newest filing's poster and subtitle (an older one may carry a poster since replaced).
  films AS (
    SELECT DISTINCT ON (h.subject_id)
           h.subject_id, h.subject_title, h.subject_sub, h.subject_image,
           count(*) OVER (PARTITION BY h.subject_id) AS filings
      FROM hits h
     ORDER BY h.subject_id, h.created_at DESC, h.id DESC
  )
  SELECT f.subject_id, f.subject_title, f.subject_sub, f.subject_image, f.filings
    FROM films f
   ORDER BY f.filings DESC, f.subject_id
   LIMIT 120;
$$;

-- add-only (1): no shipped client uses it: a function this migration makes, named by no client before it (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.dispatch_archive_films(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dispatch_archive_films(text) TO anon, authenticated, service_role;

-- A banned member's row is the host's UNBAN. REMOVE on it deleted it, as did the member stepping out
-- of the salon, while the ban stood in lounge_sanctions: the roster had nothing left to lift, and
-- the member was offered a seat the house refused (review round 9).
-- add-only (3): it only fixes: the calls replayed as the members themselves, a host's removal of a seated member as before and of a banned one kept (each_is_told_as_what_it_is_rehearsal.sql)
CREATE OR REPLACE FUNCTION public.remove_lounge_member(p_lounge_id uuid, p_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE v_creator uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT creator_id INTO v_creator FROM public.lounges WHERE id = p_lounge_id;
  IF v_creator IS NULL THEN RAISE EXCEPTION 'Lounge not found'; END IF;
  IF auth.uid() IS DISTINCT FROM v_creator THEN RAISE EXCEPTION 'Only the host can remove members'; END IF;
  IF p_user_id IS NOT DISTINCT FROM v_creator THEN RAISE EXCEPTION 'The host cannot be removed'; END IF;
  -- A banned member holds no seat to remove; their row stays, for the ban to be lifted.
  DELETE FROM public.lounge_members
   WHERE lounge_id = p_lounge_id AND user_id = p_user_id AND status <> 'banned';
END $$;

-- add-only (3): it only fixes: the calls replayed as the members themselves, a member stepping out and a host removing a seated member as before, a banned row kept (each_is_told_as_what_it_is_rehearsal.sql)
DROP POLICY "Creators can remove members" ON public.lounge_members;
CREATE POLICY "Creators can remove members" ON public.lounge_members FOR DELETE USING (
  status <> 'banned'
  AND ((auth.uid() IN (SELECT lounges.creator_id FROM public.lounges WHERE lounges.id = lounge_members.lounge_id))
       OR (auth.uid() = user_id)));

-- The bans whose rows were taken: back on their hosts' rosters, banned, to be lifted there.
INSERT INTO public.lounge_members (lounge_id, user_id, status)
SELECT s.lounge_id, s.user_id, 'banned'
  FROM public.lounge_sanctions s
 WHERE s.status = 'banned'
   AND NOT EXISTS (SELECT 1 FROM public.lounge_members m WHERE m.lounge_id = s.lounge_id AND m.user_id = s.user_id)
ON CONFLICT DO NOTHING;

-- A member's FOLLOWERS and FOLLOWING counted those the reader has hidden, whom the lists they open
-- leave out: "1 FOLLOWER" over "No one follows you yet." (review round 9). Both now leave them out.
-- add-only (3): it only fixes: the calls replayed as the members themselves, every count as before and the follow counts without a member the reader has hidden (each_is_told_as_what_it_is_rehearsal.sql)
CREATE OR REPLACE FUNCTION public.get_profile_counts(p_user_id uuid) RETURNS json
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT json_build_object(
    'logs_count',      CASE WHEN public.can_view_user_data(p_user_id)
                            THEN (SELECT COUNT(*) FROM logs WHERE user_id = p_user_id) ELSE 0 END,
    'ledger_count',    CASE WHEN public.can_view_user_data(p_user_id)
                            THEN (SELECT COUNT(*) FROM logs WHERE user_id = p_user_id
                                    AND (rating > 0 OR COALESCE(review, '') <> '')) ELSE 0 END,
    'watchlist_count', CASE WHEN public.can_view_user_data(p_user_id)
                            THEN (SELECT COUNT(*) FROM watchlists WHERE user_id = p_user_id) ELSE 0 END,
    'vault_count',     CASE WHEN public.can_view_user_data(p_user_id)
                            THEN (SELECT COUNT(*) FROM physical_archive WHERE user_id = p_user_id) ELSE 0 END,
    'lists_count',     CASE WHEN public.can_view_user_data(p_user_id)
                            THEN (SELECT COUNT(*) FROM lists WHERE user_id = p_user_id
                                    AND (is_private = false OR user_id = auth.uid())) ELSE 0 END,
    'followers_count', (SELECT COUNT(*) FROM interactions i WHERE i.target_user_id = p_user_id AND i.type = 'follow'
                          AND NOT COALESCE(i.user_id = ANY (me.hidden), false)),
    'following_count', (SELECT COUNT(*) FROM interactions i WHERE i.user_id = p_user_id AND i.type = 'follow'
                          AND NOT COALESCE(i.target_user_id = ANY (me.hidden), false))
  )
  FROM (SELECT public.hidden_authors() AS hidden) me;
$$;

-- A muted member keeps their seat: the host's MUTE tells them they "can read, but not post or react",
-- and the house gave a private salon's words, reactions, channel and roster to approved seats alone:
-- the muted member read an empty room, "Be the first to break the silence" (review round 10). A muted
-- seat reads them now; posting and reacting stay the approved seat's.
CREATE POLICY "Muted members read their private salon" ON public.lounge_messages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.lounge_members m
  WHERE ((m.lounge_id = lounge_messages.lounge_id) AND (m.user_id = auth.uid()) AND (m.status = 'muted'::text)))));
CREATE POLICY "Muted members read their private salon's reactions" ON public.lounge_message_reactions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.lounge_members m
  WHERE ((m.lounge_id = lounge_message_reactions.lounge_id) AND (m.user_id = auth.uid()) AND (m.status = 'muted'::text)))));

-- add-only (3): it only widens: the calls replayed as the members themselves, a private salon's channel to its muted seats as well, every other reader as before (each_is_told_as_what_it_is_rehearsal.sql)
CREATE OR REPLACE FUNCTION public.salon_channel_readable(p_topic text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
  SELECT CASE
    WHEN p_topic ~ '^lounge-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN EXISTS (
      SELECT 1 FROM public.lounges l
       WHERE l.id = substr(p_topic, 8)::uuid
         AND (l.is_private = false OR EXISTS (
           SELECT 1 FROM public.lounge_members m
            WHERE m.lounge_id = l.id AND m.user_id = auth.uid() AND m.status IN ('approved', 'muted'))))
    ELSE false
  END
$_$;

-- add-only (3): it only widens: the calls replayed as the members themselves, a salon's roster to its muted seats as well, the host and the approved as before (each_is_told_as_what_it_is_rehearsal.sql)
CREATE OR REPLACE FUNCTION public.is_lounge_member_or_host(_lounge_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.lounges
    WHERE id = _lounge_id AND creator_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.lounge_members
    WHERE lounge_id = _lounge_id AND user_id = auth.uid() AND status IN ('approved', 'muted')
  );
$$;

-- A member an author has blocked still read that author's records and stacks: on a film's Log Archive,
-- on the author's own pages, everywhere a log or a stack is read directly, though the feeds, the
-- filings, the critiques and the salons all leave the author out for them (review round 10). Logs
-- and stacks now take the house's one rule for the hidden, as those do.
-- add-only (3): it only fixes: the calls replayed as the members themselves, a member's own records and stacks and another's as before, none of an author who blocked the reader (each_is_told_as_what_it_is_rehearsal.sql)
CREATE POLICY logs_hide_blocked ON public.logs AS RESTRICTIVE FOR SELECT TO authenticated, anon USING ((NOT COALESCE((user_id = ANY (( SELECT public.hidden_authors() AS hidden_authors)::uuid[])), false)));
-- add-only (3): it only fixes: the reads replayed as the members themselves, as logs_hide_blocked, for stacks (each_is_told_as_what_it_is_rehearsal.sql)
CREATE POLICY lists_hide_blocked ON public.lists AS RESTRICTIVE FOR SELECT TO authenticated, anon USING ((NOT COALESCE((user_id = ANY (( SELECT public.hidden_authors() AS hidden_authors)::uuid[])), false)));
