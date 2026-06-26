-- ═══════════════════════════════════════════════════════════════════════════════
-- WAVE 2 — Privacy gate on analytics RPC (PRIV-1) + rate_limit_check hardening (RL-1)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Audit refs: BACKEND-PRIV-1 (MEDIUM), BACKEND-RL-1 (LOW)
--
-- PRIV-1: get_public_profile_analytics only checked `auth.uid() IS NULL`, not
--   `can_view_user_data(p_user_id)` → any authed user could read a PRIVATE user's
--   aggregate analytics (the data the logs RLS otherwise protects). The sibling
--   get_user_analytics already does a strict own-only check; this aligns the
--   public-viewing variant with the privacy model. Body reproduced verbatim from
--   20260609 with ONLY: (a) the gate widened, (b) STABLE added, (c) search_path set.
--
-- RL-1: rate_limit_check is SECURITY DEFINER with a dynamic EXECUTE over unqualified
--   identifiers and no SET search_path. Add SET search_path = public (matches the
--   20260609/20260622 convention; closes the search-path vector).
--
-- Idempotent (CREATE OR REPLACE). Single transaction.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── PRIV-1 ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_public_profile_analytics(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
SELECT CASE
    WHEN auth.uid() IS NULL OR NOT public.can_view_user_data(p_user_id) THEN
        -- Must be authenticated AND authorized (owner / public / approved follower)
        CAST('{"error": "forbidden"}' AS jsonb)
    ELSE (
        WITH user_logs AS (
            SELECT * FROM public.logs WHERE user_id = p_user_id
        ),
        stamps AS (
            SELECT
                COUNT(*) AS total_logs,
                COUNT(*) FILTER (WHERE year < 1960) AS pre_1960_count,
                COUNT(*) FILTER (WHERE rating = 5) AS perfect_ratings_count,
                bool_or(physical_media IS NOT NULL) AS has_physical_media,
                bool_or(status = 'abandoned') AS has_abandoned,
                COUNT(DISTINCT (year / 10) * 10) FILTER (WHERE year IS NOT NULL) AS decades_logged_count,
                EXISTS(SELECT 1 FROM user_logs GROUP BY film_id HAVING COUNT(*) > 1) AS has_rewatched
            FROM user_logs
        ),
        decades AS (
            SELECT (year / 10) * 10 AS decade, COUNT(*) AS c
            FROM user_logs
            WHERE year IS NOT NULL
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
        autopsies AS (
            SELECT
                AVG(COALESCE((autopsy::jsonb)->>'story', (autopsy::jsonb)->>'screenplay', (autopsy::jsonb)->>'script')::numeric) AS avg_story,
                AVG(COALESCE((autopsy::jsonb)->>'cinematography', (autopsy::jsonb)->>'visuals', (autopsy::jsonb)->>'acting')::numeric) AS avg_cinematography,
                AVG(COALESCE((autopsy::jsonb)->>'sound', (autopsy::jsonb)->>'score', (autopsy::jsonb)->>'editing')::numeric) AS avg_sound
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

-- ── RL-1 ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rate_limit_check(
    table_name TEXT,
    user_col TEXT,
    max_count INTEGER,
    window_minutes INTEGER DEFAULT 1440
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_count INTEGER;
BEGIN
    EXECUTE format(
        'SELECT COUNT(*) FROM public.%I WHERE %I = auth.uid() AND created_at > now() - interval ''%s minutes''',
        table_name, user_col, window_minutes
    ) INTO current_count;
    RETURN current_count < max_count;
END;
$$;

COMMIT;
