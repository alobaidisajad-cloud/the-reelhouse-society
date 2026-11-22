-- ════════════════════════════════════════════════════════════════════════════
-- 20261122_27 — a ballot's votes are counted as they are cast.
-- ════════════════════════════════════════════════════════════════════════════
--   ballot_tally counted a ballot's every vote each time a voter opened it: one member in five voted in
--   the load house's busiest ballot, so its count read 20,000 votes at 100,000 members, 100,000 at
--   500,000, in proportion to the house (the whole of dispatch_votes, by a sequential scan). And
--   freeze_closed_ballots grouped every vote of the house each time the schedule ran (every five
--   minutes). Now private.ballot_counts keeps each option's votes, counted by a trigger in the vote's own
--   statement (a vote cast, and a vote taken back with its member or its ballot), filled from the votes
--   already cast; both read it, by the ballot. The same totals and counts, for every ballot.
--   The functions first, then the trigger and the filling last: the trigger's making holds
--   dispatch_votes against new votes only to the commit, so no vote is cast between the count and the
--   trigger. Then the counts are analysed, so the planner knows them (a new table needs its statistics).
-- Undo: mobile/supabase/migrations-down/20261122_27_a_ballots_votes_are_counted_as_they_are_cast.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── each option's votes, kept ──
--   One row per ballot and option with votes, in private, which the API never serves; read only by the
--   house's own functions. No key to the filing: a ballot taken away takes its votes, and each vote its
--   count, so the making takes no lock on the filings.
CREATE TABLE IF NOT EXISTS private.ballot_counts (
  post_id      uuid     NOT NULL,
  option_index smallint NOT NULL,
  n            integer  NOT NULL CHECK (n >= 0),
  PRIMARY KEY (post_id, option_index)
);
-- add-only (1): no shipped client uses it: a table this car makes in private, which the API never serves (TestFlight build 41 and the website checked)
REVOKE ALL ON private.ballot_counts FROM PUBLIC, anon, authenticated;

-- ── a vote counted as it is cast, and taken off as it goes ──
CREATE OR REPLACE FUNCTION private.a_vote_is_counted() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    -- An option's last vote takes its row with it.
    DELETE FROM private.ballot_counts WHERE post_id = OLD.post_id AND option_index = OLD.option_index AND n <= 1;
    UPDATE private.ballot_counts SET n = n - 1
     WHERE post_id = OLD.post_id AND option_index = OLD.option_index;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    INSERT INTO private.ballot_counts AS c (post_id, option_index, n) VALUES (NEW.post_id, NEW.option_index, 1)
    ON CONFLICT (post_id, option_index) DO UPDATE SET n = c.n + 1;
  END IF;
  RETURN NULL;
END $$;
-- add-only (1): no shipped client uses it: a trigger's function this car makes in private, which the API never serves (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION private.a_vote_is_counted() FROM PUBLIC;

-- ── the tally, read from the counts ──
--   As production holds it, but each option's votes are read as counted.
-- add-only (3): it only fixes: the same totals and counts for every ballot (the rehearsal replays each ballot's tally and compares it with the votes counted again); TestFlight build 41 and the website read it as before
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
        -- Each option's votes as counted when they were cast (private.ballot_counts): never the
        -- ballot's every vote read again.
        FROM (SELECT c.option_index, c.n FROM private.ballot_counts c
               WHERE c.post_id = p_post AND c.n > 0) t)
  END
$$;

-- ── the closing ballots' totals, read from the counts ──
--   As production holds it, but each closing ballot's options are read as counted, by the ballot.
-- add-only (3): it only fixes: the same frozen totals for every closing ballot (the rehearsal replays a freeze and compares it with the votes counted again); run by the schedule alone
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
      -- Each closing ballot's options as counted when the votes were cast (private.ballot_counts), read
      -- by the ballot (OFFSET 0 keeps it a lookup per ballot): never every vote of the house grouped again
      -- each time the schedule runs.
      LEFT JOIN LATERAL (
        SELECT c.option_index, c.n
          FROM private.ballot_counts c
         WHERE c.post_id = p.id AND c.n > 0
        OFFSET 0
      ) v ON true
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

-- ── the trigger, then the votes already cast counted, last ──
-- add-only (3): it only fixes: every vote is cast and taken back as before, and counted (the rehearsal replays votes cast and taken back); TestFlight build 41 and the website vote as before
CREATE OR REPLACE TRIGGER a_vote_is_counted
  AFTER INSERT OR DELETE OR UPDATE OF post_id, option_index ON public.dispatch_votes
  FOR EACH ROW EXECUTE FUNCTION private.a_vote_is_counted();
INSERT INTO private.ballot_counts (post_id, option_index, n)
SELECT v.post_id, v.option_index, count(*) FROM public.dispatch_votes v GROUP BY v.post_id, v.option_index
ON CONFLICT (post_id, option_index) DO UPDATE SET n = EXCLUDED.n;

-- The counts, known to the planner.
-- add-only (1): no shipped client uses it: statistics, read by the planner alone
ANALYZE private.ballot_counts;
