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
