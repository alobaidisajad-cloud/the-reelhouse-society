-- ════════════════════════════════════════════════════════════════════════════
-- 20261122_67 — a film's verdict moves with each record, never counted again from all of them.
-- ════════════════════════════════════════════════════════════════════════════
--   Each record written, changed or taken away counted its film's every record again
--   (note_film_verdict, refresh_film_verdict: the mean of the ratings, how many rated it, how many
--   logged it, by the film's index and a read of each record): a member's record of a film half the
--   house has logged read half the house's records, 1.1 s at 500,000 members (load 45122008179,
--   the load house's film 1), twice as long at a million, and a member leaving read again every film
--   they had logged.
--   Now private.film_tallies keeps each film's three sums (records, records rated, the ratings' sum),
--   and each statement that writes records moves them by what it counted in and out, film by film
--   (a statement's own records, read from the statement's own rows): a record of any film reads one
--   row. A film's first move counts its records once, outside any lock (a statement that moves the
--   same film first waits only for its own key), and never again. The verdict the members read is
--   written from the sums, as before: the same mean, rounded the same, and the same counts.
--   A withholding and its giving back move the verdict in their own statement; refresh_film_verdict
--   writes the kept verdict again for its callers.
-- Undo: mobile/supabase/migrations-down/20261122_67_a_films_verdict_moves_with_each_record.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── each film's sums, kept ──
--   One row per film a record has moved since this car, in private, which the API never serves; read
--   and written only by the house's own functions. No key to the film: the verdict is written to the
--   film's row by its function, so the making takes no lock on the films.
-- add-only (1): no shipped client uses it: a table this car makes in private, which the API never serves (TestFlight build 41 and the website checked)
CREATE TABLE IF NOT EXISTS private.film_tallies (
  film_id    integer PRIMARY KEY,
  logs       bigint  NOT NULL CHECK (logs >= 0),
  rated      bigint  NOT NULL CHECK (rated >= 0),
  rating_sum numeric NOT NULL CHECK (rating_sum >= 0)
);
-- add-only (1): no shipped client uses it: a table this car makes in private, which the API never serves (TestFlight build 41 and the website checked)
REVOKE ALL ON private.film_tallies FROM PUBLIC, anon, authenticated;

-- ── a film's verdict, moved ──
--   By the records counted in and out (each may be less than nothing), from the kept sums: one row read
--   and written, held to the commit, so two writes of one film take turns and each moves from the
--   other's. A film with no sums yet is counted once, from its records as they stand with this
--   statement's own among them (an insert that meets another's sums made meanwhile moves them instead,
--   so no record is counted twice or missed). Then the verdict, written as refresh_film_verdict wrote it.
-- add-only (1): no shipped client uses it: a function this car makes in private, which the API never serves, called by the house's verdict functions alone (TestFlight build 41 and the website checked)
CREATE OR REPLACE FUNCTION private.a_films_verdict_moves(p_film integer, p_logs integer, p_rated integer, p_sum numeric) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  t private.film_tallies%ROWTYPE;
BEGIN
  IF p_film IS NULL OR p_film <= 0 THEN
    RETURN;
  END IF;

  UPDATE private.film_tallies
     SET logs = logs + p_logs, rated = rated + p_rated, rating_sum = rating_sum + p_sum
   WHERE film_id = p_film
  RETURNING * INTO t;

  IF NOT FOUND THEN
    -- The film's first move: its records counted once (a withheld one is in no film's verdict, H-B10).
    INSERT INTO private.film_tallies AS k (film_id, logs, rated, rating_sum)
    SELECT p_film, count(*), count(*) FILTER (WHERE l.rating > 0), COALESCE(sum(l.rating) FILTER (WHERE l.rating > 0), 0)
      FROM public.logs l
     WHERE l.film_id = p_film
       AND l.withheld_at IS NULL
    ON CONFLICT (film_id) DO UPDATE
      SET logs = k.logs + p_logs, rated = k.rated + p_rated, rating_sum = k.rating_sum + p_sum
    RETURNING * INTO t;
  END IF;

  INSERT INTO public.films AS f (id, avg_rating, rating_count, log_count)
  VALUES (p_film, CASE WHEN t.rated > 0 THEN ROUND(t.rating_sum / t.rated, 2) END, t.rated, t.logs)
  ON CONFLICT (id) DO UPDATE
    SET avg_rating   = EXCLUDED.avg_rating,
        rating_count = EXCLUDED.rating_count,
        log_count    = EXCLUDED.log_count;
END $$;
-- add-only (1): no shipped client uses it: a function this car makes in private, called by the house's verdict functions alone (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION private.a_films_verdict_moves(integer, integer, integer, numeric) FROM PUBLIC, anon, authenticated;

-- ── the kept verdict, written again for its callers ──
--   As production holds it, but the verdict is read from the kept sums: a withholding and its giving
--   back have already moved it in their own statement (note_film_verdict, below).
-- add-only (3): it only fixes: the same verdict for the film it names (the rehearsal replays a withholding and a giving back, and compares the verdict with the film's records counted again); run by the house's withholding functions alone
CREATE OR REPLACE FUNCTION public.refresh_film_verdict(p_film_id integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  PERFORM private.a_films_verdict_moves(p_film_id, 0, 0, 0);
END;
$$;

-- ── each statement's records, moving their films' verdicts ──
--   Once a statement, from its own rows (the records it wrote, as they were and as they are): what it
--   counted in less what it counted out, film by film, in the films' order, so two statements moving the
--   same films wait in one order. A record the house withholds is counted out of its film; a change that
--   moves no film's sums (words, a date, a poster) moves nothing.
-- add-only (3): it only fixes: the same verdicts for every film (the rehearsal replays records written, changed, moved, withheld and taken away, alone and several in one statement, and compares each film with its records counted again); a trigger's function, called by no client
CREATE OR REPLACE FUNCTION public.note_film_verdict() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  m record;
BEGIN
  IF TG_OP = 'INSERT' THEN
    FOR m IN
      SELECT n.film_id, count(*)::integer AS logs, (count(*) FILTER (WHERE n.rating > 0))::integer AS rated,
             COALESCE(sum(n.rating) FILTER (WHERE n.rating > 0), 0) AS rating_sum
        FROM moved_in n
       WHERE n.withheld_at IS NULL AND n.film_id > 0
       GROUP BY n.film_id
       ORDER BY n.film_id
    LOOP
      PERFORM private.a_films_verdict_moves(m.film_id, m.logs, m.rated, m.rating_sum);
    END LOOP;
  ELSIF TG_OP = 'DELETE' THEN
    FOR m IN
      SELECT o.film_id, -count(*)::integer AS logs, -(count(*) FILTER (WHERE o.rating > 0))::integer AS rated,
             -COALESCE(sum(o.rating) FILTER (WHERE o.rating > 0), 0) AS rating_sum
        FROM moved_out o
       WHERE o.withheld_at IS NULL AND o.film_id > 0
       GROUP BY o.film_id
       ORDER BY o.film_id
    LOOP
      PERFORM private.a_films_verdict_moves(m.film_id, m.logs, m.rated, m.rating_sum);
    END LOOP;
  ELSE
    FOR m IN
      SELECT x.film_id, sum(x.s)::integer AS logs, COALESCE(sum(x.s) FILTER (WHERE x.rating > 0), 0)::integer AS rated,
             COALESCE(sum(x.s * x.rating) FILTER (WHERE x.rating > 0), 0) AS rating_sum
        FROM (SELECT n.film_id, n.rating, 1 AS s FROM moved_in n WHERE n.withheld_at IS NULL
              UNION ALL
              SELECT o.film_id, o.rating, -1 AS s FROM moved_out o WHERE o.withheld_at IS NULL) x
       WHERE x.film_id > 0
       GROUP BY x.film_id
      HAVING sum(x.s) <> 0
          OR COALESCE(sum(x.s) FILTER (WHERE x.rating > 0), 0) <> 0
          OR COALESCE(sum(x.s * x.rating) FILTER (WHERE x.rating > 0), 0) <> 0
       ORDER BY x.film_id
    LOOP
      PERFORM private.a_films_verdict_moves(m.film_id, m.logs, m.rated, m.rating_sum);
    END LOOP;
  END IF;
  RETURN NULL;
END $$;

-- The row trigger that counted a film again for each record, for three that move it once a statement.
-- add-only (3): it only fixes: the trigger that counted each record's film again, taken off for the three below (the rehearsal replays records written, changed and taken away)
DROP TRIGGER IF EXISTS trg_verdict_film_logs ON public.logs;
-- add-only (3): it only fixes: every record is written as before, and its film's verdict moved (the rehearsal replays records written, alone and several in one statement); TestFlight build 41 and the website write records as before
CREATE OR REPLACE TRIGGER trg_verdict_film_logs_insert
  AFTER INSERT ON public.logs
  REFERENCING NEW TABLE AS moved_in
  FOR EACH STATEMENT EXECUTE FUNCTION public.note_film_verdict();
-- add-only (3): it only fixes: the moving above, for a record changed, moved to another film, withheld or given back (the rehearsal replays each)
CREATE OR REPLACE TRIGGER trg_verdict_film_logs_update
  AFTER UPDATE ON public.logs
  REFERENCING OLD TABLE AS moved_out NEW TABLE AS moved_in
  FOR EACH STATEMENT EXECUTE FUNCTION public.note_film_verdict();
-- add-only (3): it only fixes: the moving above, for a record taken away, alone or with its member (the rehearsal replays records taken away in one statement)
CREATE OR REPLACE TRIGGER trg_verdict_film_logs_delete
  AFTER DELETE ON public.logs
  REFERENCING OLD TABLE AS moved_out
  FOR EACH STATEMENT EXECUTE FUNCTION public.note_film_verdict();
