-- ════════════════════════════════════════════════════════════════════════════
-- films — one row per FILM, so the server can answer questions about a
--         member's whole archive instead of the phone guessing from sixty.
--
-- ── WHY THIS TABLE HAS TO EXIST ─────────────────────────────────────────────
-- TasteDNA and CinematicInsights need genres, cast and directors. None of that
-- is in our database — it lives at TMDB, fetched one film at a time from the
-- phone. That is why the code reads:
--
--     const idsToFetch = filmIds.slice(0, 60);   // limit for mobile perf
--
-- Sixty is roughly what a handset can pull before the page feels broken. So a
-- member with five thousand films gets a section titled REAL ANALYTICS drawn
-- from sixty of them, and nothing on screen says so. It cannot be fixed by
-- writing better code on the phone: the data has to be ours.
--
-- ── ONE ROW PER FILM, NOT PER LOG ───────────────────────────────────────────
-- "Blade Runner" is one row whether ten members log it or a hundred thousand
-- do. The table is bounded by TMDB's catalogue, not by the user count — which
-- is the property that makes this affordable at any scale.
--
-- ── EVERY COLUMN HAS A NAMED CONSUMER ───────────────────────────────────────
--   genres        TasteDNA, and CinematicInsights' genre bars
--   cast_names    CinematicInsights' "top actors"  (top 10, billing order)
--   director      CinematicInsights' "top directors"
--   runtime       the parked "what fits in 90 minutes?" watchlist idea — the
--                 one thing that feature was missing
--   country_codes the Passport is literally called a passport and shows stamps;
--                 countries are what would make it one
--   title/year/poster_path  so a row is self-describing without a join
--
-- `vote_average` and `original_language` are DELIBERATELY absent. They are free
-- in the same call and I still left them out: nothing in the app points at
-- them, and a schema where every column has a reason is worth more than four
-- spare bytes. The cost of adding one later is a re-sync, which is the same
-- cost as a freshness pass we may want anyway.
--
-- ── NOTHING HERE TOUCHES THE BUILD ON TESTFLIGHT ────────────────────────────
-- New table, new trigger, new functions. The shipped app knows none of it.
-- ════════════════════════════════════════════════════════════════════════════

-- ⚠️ ONE TRANSACTION, AND IT MATTERS MORE HERE THAN ANYWHERE ────────────────
-- This migration puts an AFTER INSERT trigger on the four busiest tables in the
-- app. If it applies HALFWAY — triggers created, table not — then note_film()
-- raises "relation public.films does not exist" on every single insert, and
-- logging a film, adding to a watchlist, shelving a disc and building a stack
-- all break instantly, for everyone, including the build already on TestFlight.
--
-- Not hypothetical: it happened during rehearsal. A run without ON_ERROR_STOP
-- created the function and all four triggers while the table was missing, and
-- every INSERT died with exactly that error.
--
-- Every statement below is transactional DDL (no CREATE INDEX CONCURRENTLY), so
-- the whole thing commits or none of it does.
BEGIN;

CREATE TABLE IF NOT EXISTS public.films (
  -- The TMDB id. Every one of our four tables already stores it, so this
  -- joins to what exists without a mapping table.
  id              integer PRIMARY KEY,

  title           text,
  year            smallint,
  runtime         smallint,
  poster_path     text,

  genres          text[] NOT NULL DEFAULT '{}',

  -- ── THE CAST, AS THREE PARALLEL ARRAYS ────────────────────────────────────
  -- Billing order preserved: position 1 is the lead. Ten is generous for "who
  -- do I watch most" and keeps a row small; past that you are into one-scene
  -- parts, which would drown the signal rather than sharpen it.
  --
  -- ⚠️ NAMES ALONE ARE NOT ENOUGH, and I nearly shipped it that way. The
  -- insights panel shows each actor's PHOTOGRAPH — storing only names would
  -- have quietly deleted every face from that section while the numbers got
  -- better. Found by reading the render, not the data.
  --
  -- Ids as well as names because two people share a name more often than you
  -- would think, and an id is what actually identifies a person.
  --
  -- Parallel arrays rather than jsonb: `unnest(a, b, c)` walks all three in one
  -- pass, which is exactly what the aggregation needs, and it costs no parsing.
  -- The edge function builds all three from one filtered list so they cannot
  -- drift out of step.
  cast_ids        integer[] NOT NULL DEFAULT '{}',
  cast_names      text[]    NOT NULL DEFAULT '{}',
  cast_profiles   text[]    NOT NULL DEFAULT '{}',

  director_id     integer,
  director        text,
  director_profile text,

  country_codes   text[] NOT NULL DEFAULT '{}',

  -- NULL means "a stub: we know this film exists, we have not read it yet".
  -- The whole design hangs off this one nullable column.
  synced_at       timestamptz,

  -- Set while a worker is reading this film, so two workers cannot both spend
  -- a TMDB call on it. A claim older than the timeout is up for grabs again,
  -- which is what makes a worker dying harmless rather than a permanent stall.
  sync_claimed_at timestamptz,

  -- TMDB does not have every id forever — films get merged, withdrawn, or were
  -- never right. Without this a dead id is retried on every pass, for ever,
  -- and slowly becomes the only thing the sync ever does.
  sync_failed     smallint NOT NULL DEFAULT 0,

  created_at      timestamptz NOT NULL DEFAULT now()
);

-- The worklist. Partial, because "unsynced" is a tiny slice of the table
-- forever after the first drain — a full index here would be almost entirely
-- dead weight.
CREATE INDEX IF NOT EXISTS idx_films_unsynced
  ON public.films (id)
  WHERE synced_at IS NULL AND sync_failed < 3;

-- ════════════════════════════════════════════════════════════════════════════
-- CEILINGS — because "every free-text column is bounded" is currently TRUE
-- ════════════════════════════════════════════════════════════════════════════
-- Checked live before writing this: of the text/jsonb columns without a length
-- CHECK, every one is value-constrained instead (`status IN ('approved',…)`,
-- `role IN (…)`) — which is stricter, not weaker. There is no free-text column
-- in this database that can grow without limit. This table would have been the
-- first, with eight of them.
--
-- The threat model is different here — TMDB writes these, not a member — so
-- these are generous. That is the point: they bound a row and keep an invariant
-- whole without ever rejecting a real film. An invariant with one exception
-- stops being something you can rely on.
--
-- Arrays are measured with array_to_string; char_length on an array is an error,
-- not a false pass, but only if you find that out before shipping it.
-- DROP-then-ADD because Postgres has no `ADD CONSTRAINT IF NOT EXISTS`, and
-- every other statement in this file is re-runnable. Caught by running the
-- migration twice on a local Postgres: the second pass died here, which is
-- exactly when you would be re-running it — after something else went wrong.
ALTER TABLE public.films DROP CONSTRAINT IF EXISTS films_text_ceilings;
ALTER TABLE public.films
  ADD CONSTRAINT films_text_ceilings CHECK (
    -- ⚠️ 300 IS NOT A ROUND NUMBER, IT IS A MATCHED ONE. The trigger below
    -- copies film_title straight into this column, and all four source tables
    -- cap film_title at exactly 300 (verified live). Lower this and a member
    -- with a long title cannot log a film at all — the CHECK would fail inside
    -- the trigger and take the whole INSERT down with it. This ceiling may rise
    -- but must never fall below the source tables'.
    char_length(title)            <= 300  AND
    char_length(poster_path)      <= 200  AND
    char_length(director)         <= 200  AND
    char_length(director_profile) <= 200  AND
    char_length(array_to_string(genres,        ',')) <= 300  AND
    char_length(array_to_string(cast_names,    ',')) <= 1000 AND
    char_length(array_to_string(cast_profiles, ',')) <= 1000 AND
    char_length(array_to_string(country_codes, ',')) <= 200
  );

-- ── ARRAY SHAPE: how many, and the three that must agree ────────────────────
-- The three cast arrays are PARALLEL and that is load-bearing:
-- `unnest(cast_ids, cast_names, cast_profiles)` walks all three together.
--
-- Verified on PG18 rather than assumed — `unnest(ARRAY[1,2,3], ARRAY['A','B'])`
-- returns a third row of `(3, NULL)`. It pads the SHORT array at the end, and
-- raises nothing. So a trailing mismatch costs us an actor (the aggregation's
-- `name IS NOT NULL` filter drops them); a mismatch introduced in the MIDDLE —
-- which is what building the three arrays in separate filter passes would do —
-- shifts every later name and face onto the wrong person's id. The second is
-- far worse than the bug this table exists to fix, and neither raises a thing.
--
-- The edge function builds all three from one filtered list so they cannot
-- drift. This constraint is what makes that a guarantee rather than a promise,
-- enforced where a future writer cannot talk its way past it.
ALTER TABLE public.films DROP CONSTRAINT IF EXISTS films_array_shape;
ALTER TABLE public.films
  ADD CONSTRAINT films_array_shape CHECK (
    cardinality(cast_ids) = cardinality(cast_names) AND
    cardinality(cast_ids) = cardinality(cast_profiles) AND
    cardinality(cast_ids) <= 10 AND
    cardinality(genres) <= 12 AND
    cardinality(country_codes) <= 12
  );

-- ════════════════════════════════════════════════════════════════════════════
-- WHO MAY WRITE: NOBODY
-- ════════════════════════════════════════════════════════════════════════════
-- This is reference data that everybody's analytics are computed from. If a
-- member could write to it they could change what another member's taste
-- profile says. Read for all; writes only through the SECURITY DEFINER trigger
-- below and the service role.
ALTER TABLE public.films ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS films_public_read ON public.films;
CREATE POLICY films_public_read ON public.films
  FOR SELECT TO anon, authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policy exists, and with RLS on that is a denial —
-- not an oversight. Stated here so the absence reads as deliberate.

REVOKE ALL ON public.films FROM anon, authenticated;
GRANT SELECT ON public.films TO anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- A FILM ENTERS: the stub, written where nobody waits for it
-- ════════════════════════════════════════════════════════════════════════════
-- Logging a film must not wait on TMDB. So the write path does the cheapest
-- possible thing — note the id and move on — and the details are read later by
-- something nobody is watching.
--
-- SECURITY DEFINER because a member's own role deliberately cannot write here.
-- search_path pinned to `public, pg_temp`: without pg_temp named explicitly a
-- caller can put a lookalike function in their temp schema and have a DEFINER
-- routine call it.
CREATE OR REPLACE FUNCTION public.note_film()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  -- `> 0` is not defensive padding. A CSV importer is on record writing
  -- `film_id: 0` on every row; a zero would become a stub that TMDB can never
  -- answer for, failing three times on every film that ever came through it.
  IF NEW.film_id IS NULL OR NEW.film_id <= 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.films (id, title)
  VALUES (NEW.film_id, NULLIF(NEW.film_title, ''))
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- All FOUR ways a film enters the system. Missing one would leave a whole
-- category of film permanently unknown to the analytics — and it would look
-- like a data problem rather than a missing trigger.
DROP TRIGGER IF EXISTS trg_note_film_logs ON public.logs;
CREATE TRIGGER trg_note_film_logs
  AFTER INSERT ON public.logs
  FOR EACH ROW EXECUTE FUNCTION public.note_film();

DROP TRIGGER IF EXISTS trg_note_film_watchlists ON public.watchlists;
CREATE TRIGGER trg_note_film_watchlists
  AFTER INSERT ON public.watchlists
  FOR EACH ROW EXECUTE FUNCTION public.note_film();

DROP TRIGGER IF EXISTS trg_note_film_vault ON public.physical_archive;
CREATE TRIGGER trg_note_film_vault
  AFTER INSERT ON public.physical_archive
  FOR EACH ROW EXECUTE FUNCTION public.note_film();

DROP TRIGGER IF EXISTS trg_note_film_list_items ON public.list_items;
CREATE TRIGGER trg_note_film_list_items
  AFTER INSERT ON public.list_items
  FOR EACH ROW EXECUTE FUNCTION public.note_film();

-- ════════════════════════════════════════════════════════════════════════════
-- SEED: everything already in the database
-- ════════════════════════════════════════════════════════════════════════════
-- The trigger only fires on NEW rows, so without this every film logged before
-- today would be invisible to the analytics for ever. Idempotent — running it
-- twice is a no-op.
INSERT INTO public.films (id, title)
SELECT DISTINCT ON (film_id) film_id, NULLIF(film_title, '')
FROM (
  SELECT film_id, film_title FROM public.logs             WHERE film_id > 0
  UNION ALL
  SELECT film_id, film_title FROM public.watchlists       WHERE film_id > 0
  UNION ALL
  SELECT film_id, film_title FROM public.physical_archive WHERE film_id > 0
  UNION ALL
  SELECT film_id, film_title FROM public.list_items       WHERE film_id > 0
) all_films
-- Sort by the CLEANED title, not the raw column.
--
-- Caught by rehearsing this on a local Postgres: `ORDER BY film_title NULLS
-- LAST` sorts '' before 'Fight Club', so DISTINCT ON picked the blank row and
-- NULLIF then turned it into NULL — storing no title for a film four tables
-- knew the name of. The NULLS LAST was there precisely to prefer a real title
-- and it was being applied to the wrong expression, which is invisible reading
-- it and obvious the moment you run it.
ORDER BY film_id, NULLIF(film_title, '') NULLS LAST
ON CONFLICT (id) DO NOTHING;

COMMIT;
