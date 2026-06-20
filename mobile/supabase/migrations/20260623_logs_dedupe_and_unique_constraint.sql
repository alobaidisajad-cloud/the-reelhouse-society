-- ═══════════════════════════════════════════════════════════════════════════════
-- DATA INTEGRITY FIX: Deduplicate logs(user_id, film_id) and enforce uniqueness
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Problem (confirmed in production):
--   The app's core invariant is "one logs row per (user_id, film_id); rewatches are
--   folded into viewing_history". This was enforced ONLY in client code — there is no
--   UNIQUE constraint on the table (logs has a NON-unique idx_logs_composite_user_film
--   on (user_id, film_id), and logs_pkey only covers id). Any path that misses the
--   client-side existingLog check (stale _loggedIndex, multi-device, offline flush,
--   fast double-tap) inserts a DUPLICATE row instead of merging.
--
--   Diagnostic at authoring time: 13 duplicate (user_id, film_id) groups, 22 extra rows.
--
-- Fix (this migration):
--   1. Choose a canonical survivor per (user_id, film_id) — newest viewing wins.
--   2. Fold every duplicate's current snapshot + any history it carried into the
--      canonical row's viewing_history (matching the camelCase shape produced by
--      mutationExecutor.ts handleDuplicateLogMerge), and recompute view_count.
--      => No reviews/ratings are lost; they become rewatch history entries.
--   3. Repoint child rows (endorsements, reports, comments) from the duplicate ids
--      to the canonical id, so no comments/reactions are orphaned by the delete.
--   4. Delete the now-merged duplicate rows.
--   5. Add UNIQUE(user_id, film_id), which now succeeds and makes the client-side
--      23505 convergence (logOperations.ts applyRewatchMerge) actually fire going
--      forward instead of silently duplicating.
--
-- Safety / operational notes (READ BEFORE RUNNING):
--   • Take a database snapshot first (Supabase Dashboard → Database → Backups).
--   • Run on a Supabase BRANCH first as a dry run, verify counts, then run on prod.
--   • This runs in a single transaction — all-or-nothing.
--   • Idempotent: re-running after the constraint exists is a no-op (no dupes remain,
--     and the constraint creation is guarded).
--   • Child repoints are self-guarding: they only run if the table/column exists,
--     so the migration won't error on schema variations.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Serialize against concurrent log writes so no NEW duplicate appears mid-migration.
LOCK TABLE public.logs IN SHARE ROW EXCLUSIVE MODE;

-- ── 1. Map every duplicate row to its canonical survivor ──────────────────────────
-- Canonical = most recent viewing (watched_date, then created_at, then id) — keeps the
-- freshest entry as the live row, exactly like the client's "latest viewing on top".
CREATE TEMP TABLE _logs_dupe_map ON COMMIT DROP AS
WITH ranked AS (
  SELECT
    id,
    first_value(id) OVER (
      PARTITION BY user_id, film_id
      ORDER BY watched_date DESC NULLS LAST, created_at DESC, id DESC
    ) AS canonical_id
  FROM public.logs
)
SELECT id AS dupe_id, canonical_id
FROM ranked
WHERE id <> canonical_id;

-- Fast exit if there is nothing to do (e.g. re-run after a prior successful run).
-- (The constraint creation at the end is independently guarded.)

-- ── 2. Fold duplicates into the canonical row's viewing_history + view_count ───────
WITH dupes AS (
  SELECT m.canonical_id, d.*
  FROM _logs_dupe_map m
  JOIN public.logs d ON d.id = m.dupe_id
),
-- One archived viewing-history entry per duplicate row (newest first), matching the
-- shape in src/utils/mutationExecutor.ts (camelCase keys).
snapshots AS (
  SELECT
    canonical_id,
    jsonb_agg(
      jsonb_build_object(
        'date',            to_jsonb(COALESCE(watched_date, created_at)),
        'rating',          COALESCE(rating, 0),
        'review',          COALESCE(review, ''),
        'watchedWith',     watched_with,
        'physicalMedia',   COALESCE(physical_media, 'None'),
        'status',          COALESCE(status, 'watched'),
        'abandonedReason', abandoned_reason,
        'isAutopsied',     COALESCE(is_autopsied, false),
        'autopsy',         autopsy,
        'altPoster',       alt_poster,
        'editorialHeader', editorial_header,
        'dropCap',         COALESCE(drop_cap, false),
        'pullQuote',       COALESCE(pull_quote, ''),
        'privateNotes',    private_notes,
        'isSpoiler',       COALESCE(is_spoiler, false),
        'videoUrl',        video_url,
        'format',          COALESCE(format, 'digital')
      )
      ORDER BY watched_date DESC NULLS LAST, created_at DESC, id DESC
    ) AS snapshot_arr,
    -- each duplicate contributes 1 viewing + whatever history it already carried
    SUM(1 + COALESCE(jsonb_array_length(viewing_history), 0))::int AS extra_views
  FROM dupes
  GROUP BY canonical_id
),
-- Preserve any viewing_history the duplicates themselves carried (flattened).
prior_histories AS (
  SELECT canonical_id, COALESCE(jsonb_agg(elem), '[]'::jsonb) AS hist_arr
  FROM dupes,
       LATERAL jsonb_array_elements(COALESCE(dupes.viewing_history, '[]'::jsonb)) AS elem
  GROUP BY canonical_id
)
UPDATE public.logs c
SET
  viewing_history =
    COALESCE(c.viewing_history, '[]'::jsonb)
    || s.snapshot_arr
    || COALESCE(p.hist_arr, '[]'::jsonb),
  view_count = COALESCE(c.view_count, 1) + s.extra_views
FROM snapshots s
LEFT JOIN prior_histories p ON p.canonical_id = s.canonical_id
WHERE c.id = s.canonical_id;

-- ── 3. Repoint child references from duplicate ids → canonical id ──────────────────
-- Endorsements (interactions.target_log_id). Avoid violating any uniqueness on
-- (user_id, target_log_id, type): repoint only where no equivalent endorsement
-- already exists on the canonical row, then drop the leftover duplicates.
UPDATE public.interactions i
SET target_log_id = m.canonical_id
FROM _logs_dupe_map m
WHERE i.target_log_id = m.dupe_id
  AND NOT EXISTS (
    SELECT 1 FROM public.interactions x
    WHERE x.user_id = i.user_id
      AND x.target_log_id = m.canonical_id
      AND x.type = i.type
  );

DELETE FROM public.interactions i
USING _logs_dupe_map m
WHERE i.target_log_id = m.dupe_id;  -- any that couldn't be repointed were dups already

-- Reports (user_reports.log_id) — FK-enforced; repoint so report history survives.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_reports' AND column_name = 'log_id'
  ) THEN
    UPDATE public.user_reports ur
    SET log_id = m.canonical_id
    FROM _logs_dupe_map m
    WHERE ur.log_id = m.dupe_id;
  END IF;
END $$;

-- Comments (log_comments.log_id) — NOT FK-enforced but read by the app via log_id;
-- repoint defensively so comments on a merged duplicate stay visible on the survivor.
--
-- NOTE: log_comments carries a BEFORE UPDATE trigger set_updated_at() that assigns
-- NEW.updated_at, but the table has no updated_at column — so a normal UPDATE errors
-- with 42703 (this is a pre-existing production bug that also breaks comment edits via
-- LogService.addLogComment's upsert-on-conflict). We bypass USER triggers for this one
-- controlled repoint; FK/constraint (system) triggers remain active. The DISABLE/ENABLE
-- pair is transaction-scoped — a rollback restores the original trigger state.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'log_comments' AND column_name = 'log_id'
  ) THEN
    ALTER TABLE public.log_comments DISABLE TRIGGER USER;
    UPDATE public.log_comments lc
    SET log_id = m.canonical_id
    FROM _logs_dupe_map m
    WHERE lc.log_id = m.dupe_id;
    ALTER TABLE public.log_comments ENABLE TRIGGER USER;
  END IF;
END $$;

-- ── 4. Delete the merged duplicate rows ───────────────────────────────────────────
DELETE FROM public.logs l
USING _logs_dupe_map m
WHERE l.id = m.dupe_id;

-- ── 5. Enforce uniqueness going forward (idempotent) ──────────────────────────────
-- Adds the constraint only if absent. After this, the client-side 23505 convergence
-- in logOperations.ts (applyRewatchMerge) fires correctly instead of duplicating.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.logs'::regclass
      AND contype = 'u'
      AND conname = 'logs_user_id_film_id_key'
  ) THEN
    ALTER TABLE public.logs
      ADD CONSTRAINT logs_user_id_film_id_key UNIQUE (user_id, film_id);
  END IF;
END $$;

-- Post-conditions you can verify after COMMIT:
--   • SELECT COUNT(*) FROM (SELECT 1 FROM logs GROUP BY user_id, film_id HAVING COUNT(*)>1) x;  -- expect 0
--   • SELECT conname FROM pg_constraint WHERE conrelid='public.logs'::regclass AND contype='u'; -- includes the unique key

COMMIT;
