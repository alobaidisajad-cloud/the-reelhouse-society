-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — undo 20260827_01_film_verdict.sql
-- ════════════════════════════════════════════════════════════════════════════
-- Not expected to be needed. Written because a migration you cannot reverse is
-- a decision you cannot revisit, and this one adds a trigger to the busiest
-- write path in the app.
--
-- ── WHAT THIS DOES, AND WHAT IT COSTS ───────────────────────────────────────
-- Drops the trigger and both functions. The COLUMNS ARE LEFT IN PLACE, on
-- purpose: dropping them is the one irreversible act here, and the app reads
-- them defensively — a film with no row, or a row with a NULL average, renders
-- as THE HOUSE HAS NOT SPOKEN, which is exactly what it should say if the
-- verdict is no longer being maintained.
--
-- So after this the page is honest but silent, and nothing is lost. If you
-- also want the columns gone, uncomment the last statement — but note that
-- re-running the forward migration afterwards would have to rebuild every
-- count from scratch, which it does anyway.
--
-- The order matters: the trigger goes FIRST. Dropping a function that a live
-- trigger still points at would fail, and dropping it with CASCADE would take
-- the trigger with it silently.

BEGIN;

SET LOCAL lock_timeout = '5s';

DROP TRIGGER IF EXISTS trg_verdict_film_logs ON public.logs;

DROP FUNCTION IF EXISTS public.note_film_verdict();
DROP FUNCTION IF EXISTS public.refresh_film_verdict(integer);

-- Deliberately commented. Uncomment ONLY if you want the data gone as well.
-- ALTER TABLE public.films
--   DROP COLUMN IF EXISTS avg_rating,
--   DROP COLUMN IF EXISTS rating_count,
--   DROP COLUMN IF EXISTS log_count;

COMMIT;

-- Confirm: this should return no rows.
-- SELECT tgname FROM pg_trigger WHERE tgname = 'trg_verdict_film_logs';
