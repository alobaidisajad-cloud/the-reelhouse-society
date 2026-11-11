-- ════════════════════════════════════════════════════════════════════════════
-- 20261111_04 — three faces per salon, never every member ranked.
-- ════════════════════════════════════════════════════════════════════════════
--   get_salon_member_faces ranked EVERY approved member of each salon it was
--   given (and asked is_hidden_by of each) to keep three: a salon of thousands
--   paid for thousands, and it was 94% of the corridor for a member in 200 rooms
--   (93.9 ms at 500,000 members, its budget 100). Each salon now walks its
--   members in the order they joined (idx_lounge_members_faces, 20261111_02) and
--   stops at the third it may show. The same three, in the same order, under the
--   same rule: a salon's members, or its host, see its faces. The rehearsal holds
--   every salon's faces, as its host sees them, to what the function gave before.
-- Undo: mobile/supabase/migrations-down/20261111_04_three_faces_per_salon.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- add-only (3): it only fixes: the same faces, in the same order, under the same rule, read without ranking every member (the rehearsal compares every salon's)
CREATE OR REPLACE FUNCTION public.get_salon_member_faces(p_lounge_ids uuid[])
  RETURNS TABLE(lounge_id uuid, username text, avatar_url text, rn integer)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $$
  SELECT r.id, f.username, f.avatar_url, f.rn::integer
  FROM (SELECT DISTINCT x.id FROM unnest(p_lounge_ids) AS x(id)) r
  CROSS JOIN LATERAL (
    SELECT first3.username, first3.avatar_url,
           row_number() OVER (ORDER BY first3.joined_at, first3.user_id) AS rn
    FROM (
      SELECT lm.user_id, lm.joined_at, p.username, p.avatar_url
      FROM public.lounge_members lm
      JOIN public.profiles p ON p.id = lm.user_id
      WHERE lm.lounge_id = r.id
        AND lm.status = 'approved'
        AND p.username IS NOT NULL
        AND NOT public.is_hidden_by(auth.uid(), lm.user_id)
      ORDER BY lm.joined_at ASC, lm.user_id ASC
      LIMIT 3
    ) first3
  ) f
  WHERE EXISTS (SELECT 1 FROM public.lounge_members me
                WHERE me.lounge_id = r.id AND me.user_id = auth.uid() AND me.status = 'approved')
     OR auth.uid() = (SELECT l.creator_id FROM public.lounges l WHERE l.id = r.id)
  ORDER BY r.id, f.rn;
$$;
