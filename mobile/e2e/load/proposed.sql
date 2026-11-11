-- ════════════════════════════════════════════════════════════════════════════
-- e2e/load/proposed.sql — a database change under MEASUREMENT, not a migration.
-- ════════════════════════════════════════════════════════════════════════════
-- load.yml applies this to its throwaway copy of production (100,000 members,
-- after the fidelity check) so a speed fix is measured at scale BEFORE anyone
-- applies it to production. It is never run against production. When it is
-- applied there, it moves to supabase/migrations under its own name and this
-- file is emptied.
--
-- Under measurement now: the two slowest reads of the house at 500,000 members
-- (load 42969529684, the owner's scale, audit A-SCALE-PLAN).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. The corridor's faces: three per salon, never every member ranked ──────
-- The corridor for a member in 200 rooms took 93.9 ms (worst 100.1, its budget
-- 100); 94% of it was get_salon_member_faces, which ranked EVERY approved member
-- of each of the member's salons (and asked is_hidden_by of each) to keep three.
-- A salon of thousands paid for thousands. Now each salon walks its members in
-- the order they joined, by an index that holds that order, and stops at the
-- third it may show. The same three, in the same order, under the same rule:
-- members of the salon, or its host, see its faces.
CREATE INDEX IF NOT EXISTS idx_lounge_members_faces
  ON public.lounge_members USING btree (lounge_id, joined_at, user_id)
  WHERE status = 'approved';

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

-- ── 2. HIGHEST RATED: the six best, read as six ────────────────────────────
-- A member's six highest rated over the whole record (ProfileDataService
-- fetchHighestRated: rating >= 4, by rating, then the newest watched, then id)
-- took 85.4 ms for a record of 10,000: every log of the member was read, and the
-- row rules asked of each, to keep six. Indexed in that order, among the ratings
-- of 4 and up alone (a partial index, a fraction of the table), the six are the
-- index's first six.
CREATE INDEX IF NOT EXISTS idx_logs_user_highest_rated
  ON public.logs USING btree (user_id, rating DESC, watched_date DESC NULLS LAST, id DESC)
  WHERE rating >= 4;
