-- ════════════════════════════════════════════════════════════════════════════
-- e2e/load/proposed.sql — a database change under MEASUREMENT, not a migration.
-- ════════════════════════════════════════════════════════════════════════════
-- load.yml applies this to its throwaway copy of production (100,000 members,
-- after the fidelity check) so a speed fix is measured at scale BEFORE anyone
-- applies it to production. It is never run against production. When it is
-- applied there, it moves to supabase/migrations under its own name and this
-- file is emptied.
--
-- Under measurement: the pending train's two files, as they will be applied
-- (supabase/migrations/20261109_01_a_part_counts_its_words.sql and
-- 20261109_02_the_corridor_in_one_trip.sql). The shape that counted a part's
-- words on every read was measured beside the stored one (56 ms against 0.2 ms
-- for a whole series at the ceiling, 2026-11-09) and dropped.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.dispatch_posts ADD COLUMN words integer GENERATED ALWAYS AS (
  cardinality(array_remove(regexp_split_to_array(coalesce(full_content, body, ''),
    '[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+'), ''))
) STORED;

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

REVOKE ALL ON FUNCTION public.get_lounge_list() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_lounge_list() TO authenticated;
GRANT ALL ON FUNCTION public.get_lounge_list() TO service_role;
