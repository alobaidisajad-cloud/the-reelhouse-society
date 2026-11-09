-- ════════════════════════════════════════════════════════════════════════════
-- 20261109_02 — the Lounge's corridor, read in one trip.
-- ════════════════════════════════════════════════════════════════════════════
--   The Lounge reads its corridor in two waves (lounge.ts fetchLounges): the
--   member's memberships, the newest rooms and the rooms they host, then, once
--   those have answered, the rooms they joined, their unread counts, the door
--   requests at their rooms, the faces of their rooms and the last words of the
--   rest. get_lounge_list() answers every piece in one call, each as the app
--   asks it today, as one jsonb the client merges as it merges them now.
--   SECURITY INVOKER: each piece is read under the rule it is read under today
--   (the rooms' and the roster's row rules; get_lounge_unread_counts,
--   get_salon_member_faces and get_salon_last_words called as the client calls
--   them, their own rules theirs), so no rule is restated here. A signed-in
--   member only. Timed in the load lab (2026-11-09): 4.6 ms for a member, 24 ms
--   for the busiest room's host, 65 ms for a member in 200 rooms; one round
--   trip saved on the phone's network.
-- Undo: mobile/supabase/migrations-down/20261109_02_the_corridor_in_one_trip.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

CREATE FUNCTION public.get_lounge_list()
RETURNS jsonb
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
    'unread', CASE WHEN EXISTS (SELECT 1 FROM memberships)
      THEN coalesce((SELECT jsonb_agg(to_jsonb(u)) FROM public.get_lounge_unread_counts() u), '[]'::jsonb) END,
    'pending', coalesce((SELECT jsonb_agg(jsonb_build_object('lounge_id', p.lounge_id))
      FROM public.lounge_members p WHERE p.lounge_id IN (SELECT id FROM hosted) AND p.status = 'pending'), '[]'::jsonb),
    'faces', coalesce((SELECT jsonb_agg(to_jsonb(f))
      FROM public.get_salon_member_faces(ARRAY(SELECT id FROM own)) f), '[]'::jsonb),
    'last_words', coalesce((SELECT jsonb_agg(to_jsonb(w))
      FROM public.get_salon_last_words(ARRAY(SELECT id FROM newest WHERE id NOT IN (SELECT id FROM own))) w), '[]'::jsonb)
  )
$$;

-- add-only (1): no shipped client uses it: a function this migration makes, named by no client before it (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.get_lounge_list() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_lounge_list() TO authenticated;
GRANT ALL ON FUNCTION public.get_lounge_list() TO service_role;
