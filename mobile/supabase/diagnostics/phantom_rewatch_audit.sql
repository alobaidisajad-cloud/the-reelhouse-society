-- ═══════════════════════════════════════════════════════════════════════════════
-- DIAGNOSTIC (READ-ONLY): Suspected "phantom rewatch" log rows
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Context:
--   Before the idempotency guard in src/utils/mutationExecutor.ts
--   (handleDuplicateLogMerge), a network error returned AFTER a log insert had
--   already committed (e.g. a 504 / dropped connection) was misread as "not
--   committed". The offline queue then re-ran the SAME insert with the SAME
--   client-generated id on flush. The duplicate-merge path archived the row into
--   ITS OWN viewing_history and bumped view_count — turning a single viewing into
--   a phantom rewatch (view_count inflated by 1, viewing_history[0] mirrors the
--   live row).
--
--   The code path is now fixed (same-id conflicts are a no-op), so NO NEW phantoms
--   are created. This script only helps inspect rows that may have been corrupted
--   BEFORE the fix shipped. The affected population is expected to be very small
--   (requires a commit-then-network-error on a log/mark action).
--
-- IMPORTANT — why this is diagnostic, not an automatic migration:
--   A phantom rewatch and a LEGITIMATE same-day rewatch (same film logged twice on
--   the same date with identical rating/review) are not perfectly distinguishable
--   from data alone. An automatic destructive repair could therefore delete real
--   rewatch history. So this file is SELECT-only by default. Review the candidates,
--   confirm by hand, and only then run the gated repair at the bottom row-by-row.
--
-- Heuristic signature of a phantom (intentionally conservative):
--   • view_count >= 2
--   • viewing_history is a non-empty array
--   • viewing_history[0] mirrors the live row: same date (anchored), same rating,
--     same status, and same review — i.e. the row was archived into itself.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Inspect suspected phantom rows (run this first, eyeball the results) ────────
SELECT
  id,
  user_id,
  film_id,
  film_title,
  view_count,
  jsonb_array_length(viewing_history)                              AS history_len,
  watched_date,
  rating,
  status,
  left(coalesce(review, ''), 60)                                   AS review_preview,
  (viewing_history -> 0 ->> 'date')                                AS h0_date,
  (viewing_history -> 0 ->> 'rating')                              AS h0_rating,
  (viewing_history -> 0 ->> 'status')                              AS h0_status,
  left(coalesce(viewing_history -> 0 ->> 'review', ''), 60)        AS h0_review_preview
FROM public.logs
WHERE coalesce(view_count, 1) >= 2
  AND jsonb_typeof(viewing_history) = 'array'
  AND jsonb_array_length(viewing_history) >= 1
  -- viewing_history[0] mirrors the live row (the self-archive signature)
  AND (viewing_history -> 0 ->> 'date')   IS NOT DISTINCT FROM to_char(watched_date, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  AND coalesce((viewing_history -> 0 ->> 'rating')::numeric, 0) IS NOT DISTINCT FROM coalesce(rating, 0)
  AND coalesce(viewing_history -> 0 ->> 'status', 'watched')    IS NOT DISTINCT FROM coalesce(status, 'watched')
  AND coalesce(viewing_history -> 0 ->> 'review', '')          IS NOT DISTINCT FROM coalesce(review, '')
ORDER BY user_id, film_id;

-- ── 2. Count only (quick sense of blast radius) ───────────────────────────────────
-- SELECT count(*) AS suspected_phantoms FROM ( <paste the SELECT above without ORDER BY> ) q;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. GATED REPAIR — DO NOT RUN UNTIL YOU HAVE:
--      (a) taken a database backup, and
--      (b) confirmed a specific id is a phantom (NOT a real same-day rewatch).
--    Run ONE row at a time by id. This drops the mirrored viewing_history[0]
--    entry and decrements view_count by 1 (never below 1).
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- BEGIN;
--   UPDATE public.logs
--   SET viewing_history = (viewing_history - 0),
--       view_count      = greatest(1, coalesce(view_count, 1) - 1)
--   WHERE id = '<CONFIRMED_PHANTOM_LOG_ID>';
--   -- Verify the row looks correct, then:
-- COMMIT;
-- -- (ROLLBACK; if anything looks wrong)
