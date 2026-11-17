-- Undo of 20261116_01: the corridor counts every request at a host's door again, unnamed, a
-- critique's certification is written under its filing's key, a salon's last word is the room's
-- newest, whoever said it, the archive's search is counted on the phone, a banned row may be taken,
-- and the follow counts count the hidden. The notices written meanwhile keep
-- the key they were written with: a phone that knows it groups them as a critique's, one that
-- does not leaves them single.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- add-only (3): it only fixes: the function as it was before 20261116_01
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
    'pending', coalesce((SELECT jsonb_agg(jsonb_build_object('lounge_id', p.lounge_id))
      FROM public.lounge_members p WHERE p.lounge_id IN (SELECT id FROM hosted) AND p.status = 'pending'), '[]'::jsonb),
    'faces', coalesce((SELECT jsonb_agg(to_jsonb(f))
      FROM public.get_salon_member_faces(ARRAY(SELECT id FROM own)) f), '[]'::jsonb),
    'last_words', coalesce((SELECT jsonb_agg(to_jsonb(w))
      FROM public.get_salon_last_words(ARRAY(SELECT id FROM newest WHERE id NOT IN (SELECT id FROM own))) w), '[]'::jsonb)
  )
$$;

-- add-only (3): it only fixes: the function as it was before 20261116_01
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
    PERFORM public.dispatch_notify(
      c.user_id, NEW.user_id, 'endorse',
      'certified your critique.',
      jsonb_build_object('dispatch_post_id', c.post_id, 'comment_id', c.id),
      'endorse:post:' || c.post_id);
  END IF;
  RETURN NEW;
END $$;

-- add-only (3): it only fixes: the function as it was before 20261116_01
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

-- The archive's search counted on the phone again.
DROP FUNCTION IF EXISTS public.dispatch_archive_films(text);

-- A removal takes a banned row with it again, and a member may step out of one.
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
  DELETE FROM public.lounge_members WHERE lounge_id = p_lounge_id AND user_id = p_user_id;
END $$;

DROP POLICY "Creators can remove members" ON public.lounge_members;
CREATE POLICY "Creators can remove members" ON public.lounge_members FOR DELETE USING (((auth.uid() IN ( SELECT lounges.creator_id
   FROM public.lounges
  WHERE (lounges.id = lounge_members.lounge_id))) OR (auth.uid() = user_id)));
-- The banned rows put back on their hosts' rosters stay: each is a ban that stands.

-- The follow counts count every follower and every followed again.
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
    'followers_count', (SELECT COUNT(*) FROM interactions WHERE target_user_id = p_user_id AND type = 'follow'),
    'following_count', (SELECT COUNT(*) FROM interactions WHERE user_id = p_user_id AND type = 'follow')
  );
$$;
