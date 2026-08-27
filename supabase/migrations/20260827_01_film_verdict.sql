-- ════════════════════════════════════════════════════════════════════════════
-- THE HOUSE'S VERDICT
-- ════════════════════════════════════════════════════════════════════════════
-- A film-logging app whose film page cannot say what the house thought is
-- missing the reason it exists. Today it cannot: `getFilmReviews` fetches logs
-- that have WRITING, capped at ten, so the film page has no average and no
-- honest count. It renders TMDB's score in the house's own brass reels and
-- prints `2,317 GLOBAL` beside them, and a member cannot tell whose verdict
-- either one is.
--
-- This gives every film three facts of its own:
--
--   avg_rating    the mean of every rating members gave it, or NULL
--   rating_count  how many members rated it
--   log_count     how many members logged it at all
--
-- NULL rather than 0 for the average, deliberately. Zero is a number and would
-- render as a verdict; NULL is the absence of one, which is exactly the state
-- the page needs to say THE HOUSE HAS NOT SPOKEN.
--
-- ── WHY log_count IS SEPARATE FROM rating_count ─────────────────────────────
-- A member can log a film without rating it and rate it without writing about
-- it. Three different populations, and conflating them is how the page ends up
-- claiming "2 LOGS" for a film with four hundred.
--
-- Transactional: BEGIN/COMMIT so a half-applied migration is impossible. If
-- any statement fails, logging is untouched.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── SAFETY, BEFORE ANYTHING TAKES A LOCK ────────────────────────────────────
-- CREATE TRIGGER takes an ACCESS EXCLUSIVE lock on `logs`, and ALTER TABLE
-- takes one on `films`. If another transaction is holding a lock on either,
-- this would WAIT — and while it waits it queues EVERY other query on that
-- table behind it. On a live app that is an outage caused by a migration that
-- was only trying to be careful.
--
-- With a lock timeout it gives up after five seconds and changes nothing:
-- BEGIN/COMMIT means a migration that fails to start is free. Run it again in
-- a quieter moment.
--
-- These are SET LOCAL, so they last exactly as long as this transaction and
-- cannot leak into the session that ran it. (They must be INSIDE the
-- transaction to have any effect at all — `SET LOCAL` before `BEGIN` is a
-- no-op with a warning, which is a safety net that silently is not there.)
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- ── WHY `numeric` AND NOT `numeric(3,2)` ────────────────────────────────────
-- `logs.rating` is `NUMERIC(3,1) DEFAULT 0` with NO CHECK constraint bounding
-- it. The app writes 0-5 and always has, but the DATABASE does not enforce
-- that — and `numeric(3,2)` tops out at 9.99. One bad row from an import, a
-- script or a future scale change, and the average overflows the column, the
-- trigger raises, and EVERY LOG INSERT IN THE APP FAILS.
--
-- An unbounded numeric cannot overflow. It costs nothing here, and the failure
-- it removes is the worst one available: a member unable to log a film.
ALTER TABLE public.films
  ADD COLUMN IF NOT EXISTS avg_rating   numeric,
  ADD COLUMN IF NOT EXISTS rating_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS log_count    integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.films.avg_rating IS
  'Mean of every rating members gave this film. NULL means the house has not spoken — never 0, which would render as a verdict.';
COMMENT ON COLUMN public.films.rating_count IS
  'How many members rated it. Not the same as log_count: a member may log without rating.';
COMMENT ON COLUMN public.films.log_count IS
  'How many members logged it at all, rated or not, written or not.';

-- ════════════════════════════════════════════════════════════════════════════
-- THE RECOMPUTE
-- ════════════════════════════════════════════════════════════════════════════
-- Recompute, not increment. An incremental counter has to be right under five
-- different edits — a rating added, changed, cleared, a log deleted, a log
-- MOVED to another film — and one wrong branch leaves a number that is quietly
-- false for ever with nothing to detect it. A recompute is correct by
-- construction, and `logs(film_id)` is indexed twice over, so it is one index
-- scan over the handful of rows a single film has.
--
-- UPSERT, never a bare UPDATE. Two AFTER triggers on `logs` fire in
-- ALPHABETICAL ORDER BY TRIGGER NAME. `trg_note_film_logs` is what creates the
-- films row for a film nobody has logged before. If this ran first, an UPDATE
-- would match zero rows and the verdict would sit silently at zero for ever —
-- a bug with no symptom. The trigger below is named to sort AFTER it, and this
-- upserts anyway, so neither the name nor the ordering is load-bearing.
--
-- SECURITY DEFINER because `films` denies writes to members by design (RLS on,
-- no write policy). search_path pinned to 'public, pg_temp' — WITHOUT pg_temp
-- NAMED EXPLICITLY the pin does nothing: a caller can plant a lookalike
-- function in their temp schema and a DEFINER routine will call it.
CREATE OR REPLACE FUNCTION public.refresh_film_verdict(p_film_id integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  -- `> 0` is not padding. A CSV importer is on record writing `film_id: 0` on
  -- every row, and a zero here would create a film that TMDB can never answer
  -- for. The same guard note_film() already carries.
  IF p_film_id IS NULL OR p_film_id <= 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.films AS f (id, avg_rating, rating_count, log_count)
  SELECT
    p_film_id,
    -- FILTER, not a WHERE: the WHERE would also shrink log_count, so a film
    -- everybody logged and nobody rated would report zero logs.
    ROUND(AVG(l.rating) FILTER (WHERE l.rating > 0), 2),
    COUNT(*) FILTER (WHERE l.rating > 0),
    COUNT(*)
  FROM public.logs l
  WHERE l.film_id = p_film_id
  ON CONFLICT (id) DO UPDATE
    SET avg_rating   = EXCLUDED.avg_rating,
        rating_count = EXCLUDED.rating_count,
        log_count    = EXCLUDED.log_count;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_film_verdict(integer) FROM PUBLIC, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- THE TRIGGER
-- ════════════════════════════════════════════════════════════════════════════
-- All THREE events. INSERT alone is the obvious version and it is wrong: a
-- member who changes a rating from five to one, or deletes the log entirely,
-- would leave the film wearing a verdict nobody holds any more.
CREATE OR REPLACE FUNCTION public.note_film_verdict()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_film_verdict(OLD.film_id);
    RETURN OLD;
  END IF;

  PERFORM public.refresh_film_verdict(NEW.film_id);

  -- An UPDATE can MOVE a log to a different film — a member fixing a
  -- mis-identified title does exactly this. Without refreshing the film it
  -- LEFT, that film keeps counting a log it no longer has, and the drift is
  -- permanent because nothing else will ever recompute it.
  IF TG_OP = 'UPDATE' AND OLD.film_id IS DISTINCT FROM NEW.film_id THEN
    PERFORM public.refresh_film_verdict(OLD.film_id);
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.note_film_verdict() FROM PUBLIC, anon, authenticated;

-- Named to sort AFTER trg_note_film_logs so the films row already exists in the
-- ordinary case. The upsert above means this is a courtesy, not a dependency.
DROP TRIGGER IF EXISTS trg_verdict_film_logs ON public.logs;
CREATE TRIGGER trg_verdict_film_logs
  AFTER INSERT OR DELETE OR UPDATE OF film_id, rating ON public.logs
  FOR EACH ROW EXECUTE FUNCTION public.note_film_verdict();

-- ════════════════════════════════════════════════════════════════════════════
-- BACKFILL
-- ════════════════════════════════════════════════════════════════════════════
-- The trigger only fires on rows written from now on. Without this, every film
-- logged before today would read as never having been logged — and the page
-- would tell a member with a thousand films that the house has never spoken
-- about any of them.
--
-- One pass over `logs`, grouped, rather than the function once per film: the
-- function is for the single-row case a trigger has, and calling it thousands
-- of times here would be thousands of index scans instead of one sequential
-- aggregate.
WITH tally AS (
  SELECT
    l.film_id,
    ROUND(AVG(l.rating) FILTER (WHERE l.rating > 0), 2) AS avg_rating,
    COUNT(*) FILTER (WHERE l.rating > 0)                AS rating_count,
    COUNT(*)                                            AS log_count
  FROM public.logs l
  WHERE l.film_id > 0
  GROUP BY l.film_id
)
INSERT INTO public.films AS f (id, avg_rating, rating_count, log_count)
SELECT t.film_id, t.avg_rating, t.rating_count, t.log_count FROM tally t
ON CONFLICT (id) DO UPDATE
  SET avg_rating   = EXCLUDED.avg_rating,
      rating_count = EXCLUDED.rating_count,
      log_count    = EXCLUDED.log_count;

COMMIT;
