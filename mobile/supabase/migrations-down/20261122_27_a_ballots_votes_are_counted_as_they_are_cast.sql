-- Undo of 20261122_27: a ballot's votes counted again on each read, as production held it.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- add-only (3): it only fixes: as production held it
CREATE OR REPLACE FUNCTION public.ballot_tally(p_post uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT CASE WHEN EXISTS (
      SELECT 1 FROM public.dispatch_posts p
       WHERE p.id = p_post
         AND p.kind = 'ballot'
         AND p.is_published AND p.withheld_at IS NULL AND p.ended_at IS NULL
         AND NOT COALESCE(p.user_id = ANY ((SELECT private.hidden_authors())::uuid[]), false)
         -- Voted in, or closed: until then the result is not the reader's to see.
         AND (p.closes_at <= now()
              OR EXISTS (SELECT 1 FROM public.dispatch_votes v
                          WHERE v.post_id = p.id AND v.user_id = auth.uid())))
    THEN (
      -- sum(t.n), not count(*): `t` is one row per option, as freeze_closed_ballots counts.
      SELECT jsonb_build_object(
               'total', COALESCE(sum(t.n), 0),
               'counts', COALESCE(jsonb_object_agg(t.option_index, t.n)
                                  FILTER (WHERE t.option_index IS NOT NULL), '{}'::jsonb))
        FROM (SELECT option_index, count(*) AS n FROM public.dispatch_votes
               WHERE post_id = p_post GROUP BY option_index) t)
  END
$$;

-- add-only (3): it only fixes: as production held it
CREATE OR REPLACE FUNCTION public.freeze_closed_ballots() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE n integer;
BEGIN
  WITH tallied AS (
    SELECT p.id,
           jsonb_build_object(
             -- sum(v.n), not count(v.id): `v` is already GROUPED BY option, so
             -- it has no id to count and one row per option rather than one per
             -- vote. Counting its rows would have recorded "2 ballots cast" for
             -- a ballot with two options and two hundred voters — a permanent,
             -- plausible, wrong number, written once and never recomputed.
             'total', coalesce(sum(v.n), 0),
             'counts', coalesce(jsonb_object_agg(v.option_index, v.n)
                                FILTER (WHERE v.option_index IS NOT NULL), '{}'::jsonb),
             'frozen_at', now()
           ) AS totals
      FROM public.dispatch_posts p
      LEFT JOIN (
        SELECT post_id, option_index, count(*) AS n
          FROM public.dispatch_votes GROUP BY post_id, option_index
      ) v ON v.post_id = p.id
     WHERE p.kind = 'ballot'
       AND p.closes_at <= now()
       AND p.frozen_totals IS NULL
       AND p.ended_at IS NULL
     GROUP BY p.id
  )
  UPDATE public.dispatch_posts p
     SET frozen_totals = t.totals
    FROM tallied t
   WHERE p.id = t.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- add-only (1): no shipped client uses it: the trigger this car made
DROP TRIGGER IF EXISTS a_vote_is_counted ON public.dispatch_votes;
-- add-only (1): no shipped client uses it: the trigger's function this car made
DROP FUNCTION IF EXISTS private.a_vote_is_counted();
-- add-only (1): no shipped client uses it: the counts this car made, in private
DROP TABLE IF EXISTS private.ballot_counts;
