-- Migration: public_profile_analytics_rpc
-- Purpose: Offloads Cinema DNA, Noir Passport Stamps, and Autopsy Math to the database to prevent mobile CPU overload.

CREATE OR REPLACE FUNCTION public.get_public_profile_analytics(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
AS $$
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
);
$$;
