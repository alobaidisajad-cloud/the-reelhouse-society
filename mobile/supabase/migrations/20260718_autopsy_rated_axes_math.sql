-- ═══════════════════════════════════════════════════════════════════════════════
-- Autopsy rated-axes math + phantom cleanup — APPLY MANUALLY via SQL editor
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠️ do NOT `supabase db push` — same law as 20260626_08 (see WAVE0_LIVE_NOTES.md).
--
-- AUTOPSY LAW (client shipped 2026-07-18, commit f05f8e4):
--   • v2 payloads carry `_v: 2` and ONLY the axes the user actually filed.
--     A stored 0 there is a deliberate verdict and MUST count in averages.
--   • Legacy payloads (no `_v`) wrote 0 for every untouched axis — and the old
--     editor displayed 0 as '—', so no legacy zero can be a deliberate score.
--     Legacy zeros are UNRATED and must be excluded from averages.
--   • Legacy rows whose axes are ALL zero are phantoms created by the old
--     "opening the drawer marks it autopsied" bug — they are not autopsies.
--
-- Two parts:
--   1. One-time cleanup: null out legacy all-zero phantom autopsies.
--   2. get_public_profile_analytics: per-axis averages honor the law above.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1a. Legacy phantom rows: flagged autopsied, but no axis was ever rated ──
UPDATE public.logs
SET is_autopsied = false, autopsy = NULL
WHERE is_autopsied = true
  AND autopsy IS NOT NULL
  AND NOT (autopsy::jsonb ? '_v')
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_each_text(autopsy::jsonb) AS kv(key, value)
    WHERE kv.value ~ '^[0-9]+(\.[0-9]+)?$' AND kv.value::numeric > 0
  );

-- ── 1b. Stray flags with no autopsy object at all ──
UPDATE public.logs
SET is_autopsied = false
WHERE is_autopsied = true AND autopsy IS NULL;

-- ── 2. Analytics RPC: rated-axes-only averages ──
CREATE OR REPLACE FUNCTION public.get_public_profile_analytics(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL OR NOT public.can_view_user_data(p_user_id)
      THEN '{"error": "forbidden"}'::jsonb
    ELSE (
      WITH user_logs AS (
        SELECT *,
          CASE WHEN year::text ~ '^\d+$' THEN year::text::int END AS year_int
        FROM public.logs WHERE user_id = p_user_id
      ),
      stamps AS (
        SELECT
          COUNT(*) AS total_logs,
          COUNT(*) FILTER (WHERE year_int < 1960) AS pre_1960_count,
          COUNT(*) FILTER (WHERE rating = 5) AS perfect_ratings_count,
          bool_or(physical_media IS NOT NULL) AS has_physical_media,
          bool_or(status = 'abandoned') AS has_abandoned,
          COUNT(DISTINCT (year_int / 10) * 10) FILTER (WHERE year_int IS NOT NULL) AS decades_logged_count,
          EXISTS(SELECT 1 FROM user_logs GROUP BY film_id HAVING COUNT(*) > 1) AS has_rewatched
        FROM user_logs
      ),
      decades AS (
        SELECT (year_int / 10) * 10 AS decade, COUNT(*) AS c
        FROM user_logs
        WHERE year_int IS NOT NULL
        GROUP BY decade
        ORDER BY c DESC
        LIMIT 3
      ),
      dna AS (
        SELECT
          AVG(rating) FILTER (WHERE rating > 0) AS avg_rating,
          (SELECT jsonb_agg(jsonb_build_object(d.decade::text || 's', d.c)) FROM decades d) AS top_decades
        FROM user_logs
      ),
      -- AUTOPSY LAW: v2 rows (`_v` present) average their stored values as-is —
      -- absent axes are NULL (skipped by AVG), stored zeros are deliberate and
      -- count. Legacy rows run through NULLIF(...,0) so untouched-zero axes are
      -- skipped instead of deflating the averages.
      autopsies AS (
        SELECT
          AVG(CASE WHEN (autopsy::jsonb) ? '_v'
                THEN COALESCE(((autopsy::jsonb)->>'story')::numeric, ((autopsy::jsonb)->>'screenplay')::numeric, ((autopsy::jsonb)->>'script')::numeric)
                ELSE NULLIF(COALESCE((autopsy::jsonb)->>'story', (autopsy::jsonb)->>'screenplay', (autopsy::jsonb)->>'script')::numeric, 0)
              END) AS avg_story,
          AVG(CASE WHEN (autopsy::jsonb) ? '_v'
                THEN COALESCE(((autopsy::jsonb)->>'cinematography')::numeric, ((autopsy::jsonb)->>'visuals')::numeric, ((autopsy::jsonb)->>'acting')::numeric)
                ELSE NULLIF(COALESCE((autopsy::jsonb)->>'cinematography', (autopsy::jsonb)->>'visuals', (autopsy::jsonb)->>'acting')::numeric, 0)
              END) AS avg_cinematography,
          AVG(CASE WHEN (autopsy::jsonb) ? '_v'
                THEN COALESCE(((autopsy::jsonb)->>'sound')::numeric, ((autopsy::jsonb)->>'score')::numeric, ((autopsy::jsonb)->>'editing')::numeric)
                ELSE NULLIF(COALESCE((autopsy::jsonb)->>'sound', (autopsy::jsonb)->>'score', (autopsy::jsonb)->>'editing')::numeric, 0)
              END) AS avg_sound
        FROM user_logs
        WHERE is_autopsied = true AND autopsy IS NOT NULL
      )
      SELECT jsonb_build_object(
        'stamps', (SELECT to_jsonb(s.*) FROM stamps s),
        'dna', (SELECT to_jsonb(d.*) FROM dna d),
        'autopsy_math', (SELECT to_jsonb(a.*) FROM autopsies a)
      )
    )
  END;
$$;

COMMIT;

-- ── Verification (run after) ──
-- Phantoms gone:
--   SELECT COUNT(*) FROM public.logs WHERE is_autopsied = true AND autopsy IS NULL;                       -- expect 0
--   SELECT COUNT(*) FROM public.logs WHERE is_autopsied = true AND NOT (autopsy::jsonb ? '_v')
--     AND NOT EXISTS (SELECT 1 FROM jsonb_each_text(autopsy::jsonb) kv
--                     WHERE kv.value ~ '^[0-9]+(\.[0-9]+)?$' AND kv.value::numeric > 0);                  -- expect 0
