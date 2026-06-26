-- ═══════════════════════════════════════════════════════════════════════════════
-- Privacy RLS + analytics RPC restore (Phase 2 #1)  — APPLIED MANUALLY 2026-06-26
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠️ do NOT `supabase db push` — see WAVE0_LIVE_NOTES.md. Applied via SQL editor.
--
-- WAVE 0 found two drift gaps the repo audit couldn't see:
--   • `get_public_profile_analytics` (+ helper `can_view_user_data`) did NOT exist on
--     the live DB → the app's profile-analytics call was failing. (This is also the
--     PRIV-1 function.) Restored here, recovered from 20260601/20260609, with the
--     privacy gate baked in, hardened (STABLE + search_path), and adapted for the
--     live schema where `logs.year` is TEXT (numeric year computed safely).
--   • The "flawless privacy RLS" (20260613) was never deployed → logs/lists/watchlists
--     and their comments were readable by EVERYONE even for private accounts. Fixed:
--     dropped the `USING (true)` SELECT policies and replaced them with
--     can_view_user_data-based ones. Owner-manage (ALL) policies were left intact.
--
-- Verified live: the only SELECT path on these tables is now can_view_user_data
-- (public → everyone, private → followers/self) or ownership. No `USING(true)` remains.
-- `interactions` (the follow graph) was intentionally NOT tightened here.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Privacy helper (sees only profiles + interactions) ──
CREATE OR REPLACE FUNCTION public.can_view_user_data(target_uid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  is_private boolean;
  is_following boolean;
BEGIN
  IF auth.uid() = target_uid THEN
    RETURN TRUE;
  END IF;
  SELECT is_social_private INTO is_private FROM public.profiles WHERE id = target_uid;
  IF NOT COALESCE(is_private, false) THEN
    RETURN TRUE;
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.interactions
    WHERE type = 'follow' AND user_id = auth.uid() AND target_user_id = target_uid
  ) INTO is_following;
  RETURN is_following;
END;
$$;

-- ── Analytics RPC (privacy-gated; logs.year is TEXT on live → safe numeric cast) ──
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

-- ── Privacy SELECT policies: drop USING(true) reads, add can_view_user_data reads ──
DO $$
DECLARE
  r RECORD;  -- table
  p RECORD;  -- policy
BEGIN
  FOR r IN
    SELECT c.relname AS tbl
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname IN ('logs','lists','watchlists')
  LOOP
    FOR p IN
      SELECT pol.polname
      FROM pg_policy pol JOIN pg_class cc ON cc.oid = pol.polrelid
      WHERE cc.relname = r.tbl AND pol.polcmd = 'r'
        AND pg_get_expr(pol.polqual, pol.polrelid) = 'true'
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.polname, r.tbl);
    END LOOP;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.tbl || '_select_authorized', r.tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT USING (public.can_view_user_data(user_id))',
      r.tbl || '_select_authorized', r.tbl
    );
  END LOOP;
END $$;

DO $$
DECLARE p RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='log_comments') THEN
    FOR p IN SELECT pol.polname FROM pg_policy pol JOIN pg_class cc ON cc.oid=pol.polrelid
             WHERE cc.relname='log_comments' AND pol.polcmd='r'
               AND pg_get_expr(pol.polqual,pol.polrelid)='true' LOOP
      EXECUTE format('DROP POLICY %I ON public.log_comments', p.polname);
    END LOOP;
    DROP POLICY IF EXISTS log_comments_select_authorized ON public.log_comments;
    CREATE POLICY log_comments_select_authorized ON public.log_comments FOR SELECT
      USING (EXISTS (SELECT 1 FROM public.logs l
                     WHERE l.id = log_comments.log_id AND public.can_view_user_data(l.user_id)));
  END IF;

  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='list_comments') THEN
    FOR p IN SELECT pol.polname FROM pg_policy pol JOIN pg_class cc ON cc.oid=pol.polrelid
             WHERE cc.relname='list_comments' AND pol.polcmd='r'
               AND pg_get_expr(pol.polqual,pol.polrelid)='true' LOOP
      EXECUTE format('DROP POLICY %I ON public.list_comments', p.polname);
    END LOOP;
    DROP POLICY IF EXISTS list_comments_select_authorized ON public.list_comments;
    CREATE POLICY list_comments_select_authorized ON public.list_comments FOR SELECT
      USING (EXISTS (SELECT 1 FROM public.lists l
                     WHERE l.id = list_comments.list_id AND public.can_view_user_data(l.user_id)));
  END IF;
END $$;

COMMIT;
